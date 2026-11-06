using Dapper;
using FcMarket.Api.Analysis;
using FcMarket.Api.Data;
using FcMarket.Api.FieldMaps;
using Microsoft.Data.Sqlite;

namespace FcMarket.Tests;

public sealed class TransferEvidenceTests
{
    [Fact] public void Only_explicit_player_id_same_snapshot_and_unique_latest_past_event_establish_a_fee()
    {
        using var con = new SqliteConnection("Data Source=:memory:"); con.Open();
        con.Execute("""
            CREATE TABLE raw_transfers(snapshot_id TEXT,playerid,sellingteamid,buyingteamid,transferamount,transferdate);
            CREATE TABLE raw_teams(snapshot_id TEXT,teamid,teamname);
            INSERT INTO raw_teams VALUES('S',10,'Önceki'),('S',20,'Yeni');
            """);
        var map = TestConfig.FieldMap; var today = new DateOnly(2030, 7, 28);
        int Enc(int year, int month, int day) => new DateOnly(year, month, day).DayNumber - map.Epoch.DayNumber;
        void Row(string snap, int id, long amount, int date) => con.Execute("INSERT INTO raw_transfers VALUES(@snap,@id,10,20,@amount,@date)", new { snap, id, amount, date });
        Row("S", 1, 1000000, Enc(2029, 7, 1)); Row("S", 1, 2500000, Enc(2030, 7, 1));
        Row("S", 1, 2500000, Enc(2030, 7, 1)); // repeated identical observation
        Row("X", 1, 99000000, Enc(2030, 7, 20)); // another source cannot leak
        Row("S", 1, 99900000, Enc(2031, 7, 1)); // future
        Row("S", -1, -1, -1); Row("S", 2, 1000, 1); // placeholders / implausible epoch sentinel
        Row("S", 3, 1000, Enc(2030, 7, 2)); Row("S", 3, 2000, Enc(2030, 7, 2)); // conflicting same-day fee
        Row("S", 4, 0, Enc(2030, 7, 3)); // a real observed zero must stay zero
        var result = TransferEvidenceReader.Read(con, ResolvedSchema.FromDb(map, con), "S", today);
        Assert.Equal(2, result.Count); Assert.Equal(2500000, result[1].Amount); Assert.Equal(new DateOnly(2030, 7, 1), result[1].Date);
        Assert.Equal(("Önceki", "Yeni", "S"), (result[1].FromClub, result[1].ToClub, result[1].SnapshotId));
        Assert.Equal(0, result[4].Amount); Assert.DoesNotContain(3, result.Keys);
    }
    [Fact] public void Missing_table_or_player_key_is_no_evidence_and_explicit_yyyymmdd_encoding_is_supported()
    {
        using var con = new SqliteConnection("Data Source=:memory:"); con.Open(); var map = TestConfig.FieldMap;
        Assert.Empty(TransferEvidenceReader.Read(con, ResolvedSchema.FromDb(map, con), "S", new(2030, 7, 28)));
        con.Execute("CREATE TABLE raw_transfers(snapshot_id TEXT,playerid,sellingteamid,buyingteamid,transferamount,transferdate); INSERT INTO raw_transfers VALUES('S',7,10,20,5000000,20300701)");
        map.TransferHistoryDateEncoding = "yyyyMMdd";
        Assert.Equal(5000000, TransferEvidenceReader.Read(con, ResolvedSchema.FromDb(map, con), "S", new(2030, 7, 28))[7].Amount);
    }

    [Fact] public void Career_transfers_and_archive_provide_evidence_while_zero_fee_free_moves_stay_excluded_by_default()
    {
        using var con = new SqliteConnection("Data Source=:memory:"); con.Open();
        con.Execute("""
            CREATE TABLE snapshots(snapshot_id TEXT PRIMARY KEY, save_uid TEXT, branch INTEGER, game_date TEXT);
            INSERT INTO snapshots VALUES('S','u1',1,'2030-07-28');
            CREATE TABLE raw_teams(snapshot_id TEXT,teamid,teamname);
            INSERT INTO raw_teams VALUES('S',73,'PSG'),('S',326,'Fenerbahçe'),('S',11,'Man Utd');
            CREATE TABLE raw_career_transfers(snapshot_id TEXT,transferkey,playerid,fromteamid,toteamid,fee,wage,clause,date,source);
            INSERT INTO raw_career_transfers VALUES('S',1,277909,73,326,90000000,60000,0,20300709,'club');
            INSERT INTO raw_career_transfers VALUES('S',2,888,111592,326,0,15000,0,20300710,'world');
            CREATE TABLE career_transfer_archive(save_uid TEXT,branch INTEGER,season TEXT,transfer_date TEXT,playerid INTEGER,from_teamid INTEGER,to_teamid INTEGER,fee INTEGER,wage INTEGER,clause INTEGER,source TEXT,snapshot_id TEXT);
            INSERT INTO career_transfer_archive VALUES('u1',1,'2029/30','2030-01-31',235152,11,326,9000000,50000,NULL,'club','S0');
            """);
        var map = TestConfig.FieldMap;
        var schema = ResolvedSchema.FromDb(map, con);
        var paidOnly = TransferEvidenceReader.Read(con, schema, "S", new(2030, 7, 28));
        Assert.Equal(90000000, paidOnly[277909].Amount);
        Assert.Equal(("PSG", "Fenerbahçe", "S"), (paidOnly[277909].FromClub, paidOnly[277909].ToClub, paidOnly[277909].SnapshotId));
        Assert.Equal(9000000, paidOnly[235152].Amount);
        Assert.Equal(new DateOnly(2030, 1, 31), paidOnly[235152].Date);
        Assert.DoesNotContain(888, paidOnly.Keys);

        var withFree = TransferEvidenceReader.Read(con, schema, "S", new(2030, 7, 28), includeFree: true);
        Assert.Equal(0, withFree[888].Amount);
        Assert.Equal(map.FreeAgents.Label, withFree[888].FromClub);
    }
}
