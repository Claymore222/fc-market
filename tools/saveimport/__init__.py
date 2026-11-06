"""Read-only FC career save ingestion. Never opens game saves for writing."""
import sys

# Günlükler Türkçe (ı, ş, ğ). Türkçe olmayan bir Windows'ta konsol/boru kodlaması (ör. cp1252) bu harfleri yazamaz ve
# print bir içe aktarma işlemini yarıda keserdi (exporter/tools/importer.py da aynı çıktıya yazar). Kodlama korunur,
# yazılamayan harf ı gibi kaçışla yazılır.
for _stream in (sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(errors="backslashreplace")
        except (OSError, ValueError):
            pass
