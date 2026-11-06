"""Bounded FBCHUNKS/Zstandard/T3DB reader, implemented independently.

The apparent compact descriptors in compressed bytes are NOT a new DB format.
Only decompressed database boundaries are used. Python 3.14 supplies Zstandard;
on earlier Python versions install the optional `zstandard` package.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import shutil
import struct
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
MAX_BYTES = 64 * 1024 * 1024
DB_MAGIC = b"DB\0\x08\0\0\0\0"
ZSTD_MAGIC = bytes.fromhex("28 b5 2f fd")


class FormatError(ValueError):
    pass


def checked(data: bytes, offset: int, size: int) -> bytes:
    if offset < 0 or size < 0 or offset + size > len(data):
        raise FormatError(f"Read outside block: {offset}+{size}/{len(data)}")
    return data[offset:offset + size]


def unpack(fmt: str, data: bytes, offset: int):
    return struct.unpack(fmt, checked(data, offset, struct.calcsize(fmt)))


def backup_save(source: Path, directory: Path) -> Path:
    """Copy before reading, reject a concurrent game write, retain immutable hash copy.

    No exclusive lock is taken on the source. It is opened by shutil only as rb.
    Destination may never be inside the source save directory.
    """
    source, directory = source.resolve(), directory.resolve()
    if directory == source.parent or source.parent in directory.parents:
        raise ValueError("Backups must be outside the game's save directory")
    directory.mkdir(parents=True, exist_ok=True)
    before = source.stat()
    if not 0 < before.st_size <= MAX_BYTES:
        raise FormatError("Unsupported save size")
    with tempfile.NamedTemporaryFile(dir=directory, suffix=".partial", delete=False) as f:
        temporary = Path(f.name)
    try:
        shutil.copyfile(source, temporary)
        after = source.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise FormatError("Save changed while copying; retry after the game finishes")
        digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
        target = directory / f"{source.name}.{digest}.save"
        if not target.exists():
            temporary.replace(target)
        return target
    finally:
        temporary.unlink(missing_ok=True)


def decompress_frame(data: bytes, offset: int) -> tuple[bytes, int]:
    try:
        from compression.zstd import ZstdDecompressor
        decoder = ZstdDecompressor()
        output = decoder.decompress(data[offset:], max_length=MAX_BYTES + 1)
        if len(output) > MAX_BYTES or not decoder.eof:
            raise FormatError("Truncated or oversized Zstandard frame")
        return output, len(data) - len(decoder.unused_data)
    except ImportError:
        try:
            import zstandard
        except ImportError as exc:
            raise FormatError("Use Python 3.14+ or install zstandard") from exc
        # Streaming prevents a malicious frame from allocating an unbounded output.
        import io
        with zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data[offset:]), read_across_frames=False) as stream:
            output = stream.read(MAX_BYTES + 1)
        if len(output) > MAX_BYTES:
            raise FormatError("Oversized Zstandard frame")
        # Only the first frame is needed for the database payload.
        return output, len(data)


@dataclass(frozen=True)
class Field:
    name: str
    kind: int
    bit: int
    width: int
    low: int


@dataclass
class Table:
    name: str
    fields: list[Field]
    rows: list[dict]
    capacity: int
    written: int
    cancelled: int
    offset: int


@dataclass
class Save:
    tables: dict[str, Table]
    payload: bytes
    container: bytes
    database_offsets: list[int]


def metadata(path: Path) -> dict:
    result = {t.attrib["shortname"]: (t.attrib["name"],
            {f.attrib["shortname"]: f.attrib for f in t.findall("./fields/field")})
            for t in ET.parse(path).findall("./table")}
    overrides = path.with_name("fc27-overrides.json")
    if overrides.exists():
        for table, fields in json.loads(overrides.read_text(encoding="utf-8")).items():
            if table in result:
                result[table][1].update(fields)
    return result


def read_database(data: bytes, base: int, meta: dict) -> list[Table]:
    length, reserved, count = unpack("<III", data, base + 8)
    if reserved != 0 or not 0 < count <= 4096 or length > MAX_BYTES:
        raise FormatError("Unsupported T3DB header")
    db = checked(data, base, length)
    start = 28 + count * 8
    directory = [unpack("<4sI", db, 24 + i * 8) for i in range(count)]
    offsets = [o for _, o in directory]
    if len(set(offsets)) != count or offsets != sorted(offsets):
        raise FormatError("Invalid table directory")
    result = []
    for i, (code, relative) in enumerate(directory):
        end = start + offsets[i + 1] if i + 1 < count else length
        tb = checked(db, start + relative, end - start - relative)
        record_size, bit_limit, string_size = unpack("<III", tb, 4)
        capacity, written, cancelled = unpack("<HHH", tb, 16)
        fields_count = unpack("<B", tb, 24)[0]
        if not record_size or record_size > 65536 or written > capacity or cancelled > written or not fields_count:
            raise FormatError("Invalid table header")
        name, definitions = meta.get(code.decode("ascii"), (None, None))
        if name is None:
            raise FormatError(f"Unknown table code {code!r}; update metadata")
        fields = []
        for j in range(fields_count):
            kind, bit, short, width = unpack("<II4sI", tb, 36 + j * 16)
            definition = definitions.get(short.decode("ascii"))
            if definition is None:
                raise FormatError(f"Unknown field {name}/{short!r}; update metadata")
            if kind not in (0, 3, 4) or not width or bit + width > record_size * 8:
                raise FormatError(f"Unsupported field layout {name}/{short!r}: {kind}, {bit}, {width}")
            if kind in (0, 4) and (bit % 8 or width % 8 or (kind == 4 and width != 32)):
                raise FormatError("Unaligned text/float field")
            fields.append(Field(definition["name"], kind, bit, width,
                                int(definition.get("rangelow", 0)) if kind == 3 else 0))
        if len({f.name for f in fields}) != len(fields):
            raise FormatError("Duplicate field")
        records_at = 36 + fields_count * 16
        checked(tb, records_at, capacity * record_size)
        rows, skipped = [], 0
        for j in range(written):
            record = tb[records_at + j * record_size: records_at + (j + 1) * record_size]
            if record[-1] & 0x80:
                skipped += 1
                continue
            bits = int.from_bytes(record, "little")
            row = {}
            for f in fields:
                if f.kind == 0:
                    value = record[f.bit // 8:(f.bit + f.width) // 8].split(b"\0", 1)[0].decode("utf-8")
                elif f.kind == 4:
                    value = struct.unpack_from("<f", record, f.bit // 8)[0]
                else:
                    value = ((bits >> f.bit) & ((1 << f.width) - 1)) + f.low
                    if f.width == 32 and value >= 2 ** 31:
                        value -= 2 ** 32
                row[f.name] = value
            rows.append(row)
        if skipped != cancelled:
            raise FormatError(f"Cancelled record count mismatch in {name}: {skipped}/{cancelled}")
        result.append(Table(name, fields, rows, capacity, written, cancelled, base + start + relative))
    return result


def parse_bytes(data: bytes, meta_path: Path = ROOT / "config/saveimport/fifa_ng_db-meta.xml") -> Save:
    if len(data) > MAX_BYTES or not data.startswith(b"FBCHUNKS\x01\0"):
        raise FormatError("Unsupported save container")
    frame = data.find(ZSTD_MAGIC)
    payload = decompress_frame(data, frame)[0] if frame >= 0 else data
    meta = metadata(meta_path)
    tables, offsets, cursor = {}, [], 0
    while (base := payload.find(DB_MAGIC, cursor)) >= 0:
        offsets.append(base)
        for table in read_database(payload, base, meta):
            if table.name in tables:
                raise FormatError(f"Duplicate table {table.name}")
            tables[table.name] = table
        cursor = base + unpack("<I", payload, base + 8)[0]
    if len(offsets) != 2:
        raise FormatError(f"Expected two T3DB databases, found {len(offsets)}")
    return Save(tables, payload, data, offsets)


def read_save(source: Path, backup_dir: Path) -> tuple[Save, Path]:
    copy = backup_save(source, backup_dir)
    return parse_bytes(copy.read_bytes()), copy
