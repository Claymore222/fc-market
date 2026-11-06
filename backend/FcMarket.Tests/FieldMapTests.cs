using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;

namespace FcMarket.Tests;

public class FieldMapTests
{
    private static IReadOnlySet<string> Set(params string[] xs) => xs.ToHashSet(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// fc_export.lua'nın FC 27'de ürettiği kolonların field-map'i ilgilendiren kısmı (ilk gerçek snapshot, 17.10.2029).
    /// FC 27'de career_playercontract ve player_stats yok: sözleşme players'ta, istatistik prevcompetitionstats'ta.
    /// </summary>
    private static IReadOnlySet<string>? ExportColumns(string table, FieldMap map) => table switch
    {
        "players" => Set(map.Player.Where(kv => kv.Key != "table").Select(kv => kv.Value)
            .Concat(map.AllAttributes()).Concat(["firstnameid", "lastnameid", "wage", "contractvaliduntil"]).ToArray()),
        "player_names" => Set("playerid", "name", "club_teamid"),
        "teams" => Set("teamid", "teamname", "overallrating", "attackrating", "midfieldrating", "defenserating", "clubworth",
            "captainid", "penaltytakerid", "freekicktakerid", "leftfreekicktakerid", "rightfreekicktakerid",
            "leftcornerkicktakerid", "rightcornerkicktakerid", "longkicktakerid", "buildupplay", "defensivedepth",
            "domesticprestige", "internationalprestige", "teamstadiumcapacity", "foundationyear", "leaguetitles",
            "domesticcups", "uefa_cl_wins", "uefa_el_wins", "uefa_uecl_wins", "rivalteam", "youthdevelopment",
            "teamcolor1r", "teamcolor1g", "teamcolor1b", "teamcolor2r", "teamcolor2g", "teamcolor2b", "popularity",
            "throwerleft", "throwerright", "cksupport1", "cksupport2", "cksupport3", "cksupport4", "cksupport5", "cksupport6",
            "cksupport7", "cksupport8", "cksupport9"),
        "leagueteamlinks" => Set("leagueid", "teamid", "currenttableposition", "previousyeartableposition", "points",
            "nummatchesplayed", "homewins", "homedraws", "homelosses", "awaywins", "awaydraws", "awaylosses", "homegf",
            "homega", "awaygf", "awayga", "objective", "champion", "prevleagueid"),
        "teamplayerlinks" => Set("playerid", "teamid", "jerseynumber", "position", "form", "injury"),
        "playerloans" => Set("playerid", "teamidloanedfrom", "loandateend", "isloantobuy"),
        "transfers" => Set("playerid", "sellingteamid", "buyingteamid", "transferamount", "transferdate"),
        "fixtures" => Set("fixtureid", "fixturedate", "fixturetime", "hometeamid", "awayteamid", "competitionid",
            "hometeamleaguepos", "awayteamleaguepos"),
        "career_playermatchratinghistory" => Set("playerid", "date", "minsplayed", "rating"),
        "prevcompetitionstats" => Set("playerid", "teamid", "competitionid", "appearances", "goals", "assists", "yellowcards",
            "redcards", "cleansheets"),
        "career_youthplayers" => Set("playerid", "playertier", "potentialvariance", "monthsinsquad"),
        // Kariyer kaydından (tools/saveimport) gelen tablolar
        "career_teamofweek" => Set("playerid", "matchrating", "weekswon", "month"),
        "career_playerawards" => Set("playerid", "teamid", "typeid", "season", "count"),
        "career_managerawards" => Set("teamid", "typeid", "receiveddate", "season", "count"),
        "career_playergrowthuserseason" => Set("playerid", "overall"),
        "career_competitions" => Set("compid", "code", "level", "parentid"),
        "career_fixtures" => Set("fixtureindex", "compid", "round", "date", "time", "homeslot", "awayslot", "homegoals", "awaygoals", "status"),
        "career_standings" => Set("standingindex", "groupid", "teamid", "homewins", "homedraws", "homelosses", "homegf", "homega",
            "awaywins", "awaydraws", "awaylosses", "awaygf", "awayga", "points"),
        "career_playerstats" => Set("teamid", "playerid", "compid", "appearances", "minutes", "goals", "assists", "yellowcards",
            "redcards", "ratingtotal", "cleansheets", "goalsconceded"),
        "career_playerrecentmatches" => Set("playerid", "compid", "date", "minutes", "rating"),
        "career_playerfitness" => Set("playerid", "fitness", "severity", "injurytype", "bodypart", "returndate", "phase", "daystofit"),
        "career_playermorale" => Set("playerid", "temperament", "morale", "teamperformance", "playerperformance", "contract",
            "playingtime", "events"),
        "career_finance" => Set("transferbudgetstart", "transferbudget", "wagebudget", "wagebudgetleft", "wageheadroom", "balance"),
        "career_transactions" => Set("txindex", "amount", "kind", "date", "income"),
        "career_seasonhistory" => Set(map.CareerSeasonHistory.Where(kv => kv.Key != "table").Select(kv => kv.Value).ToArray()),
        "career_financecategories" => Set("kind", "income", "expense"),
        "career_scoutnetwork" => Set("scoutkey", "list", "slot", "covernation", "nationality", "experience", "judgement",
            "firstname", "lastname", "newscoutsdate"),
        "career_preseason" => Set("compid", "key", "teamids", "prize", "entered", "confirmeddate"),
        "career_suspensions" => Set("rowkey", "playerid", "teamid", "yellows", "ban", "compkey"),
        "career_boardobjectives" => Set("objectiveid", "compobjid", "compid", "kind", "target", "stretch", "minimum"),
        "career_manager" => Set("recordid", "wage", "earnings", "lossdate", "lossopponent", "lossfor", "lossagainst", "windate",
            "winopponent", "winfor", "winagainst", "season", "difficulty", "halflength"),
        "career_scouts" => Set("scoutid", "firstname", "lastname", "experience", "knowledge", "nationality", "regionid"),
        "career_transfers" => Set("transferkey", "date", "playerid", "fromteamid", "toteamid", "fee", "wage", "clause", "source"),
        "leagues" => Set("leagueid", "leaguename", "isinternationalleague", "level", "countryid", "iswomencompetition"),
        "nations" => Set("nationid", "nationname", "isocountrycode"),
        _ => null,
    };

    [Fact]
    public void Repo_field_map_loads_with_plan_defaults()
    {
        var map = TestConfig.FieldMap;
        Assert.Equal("players", map.Player["table"]);
        Assert.Equal("overallrating", map.Player["overall"]);
        Assert.Equal(new DateOnly(1582, 10, 14), map.Epoch);
        Assert.Equal("ST", map.PositionLabel(25));
        Assert.Equal("ATT", map.PositionGroupOf("ST"));
        Assert.Equal(7, map.AttributeGroups.Count);
        Assert.Contains(map.GoalkeeperGroup!, map.AttributeGroups.Keys);
        Assert.All(map.AllAttributes(), a => Assert.True(map.AttributeLabels.ContainsKey(a), $"etiket yok: {a}"));
    }

    [Fact]
    public void Repo_field_map_matches_fc27_export()
    {
        var map = TestConfig.FieldMap;
        Assert.Empty(FieldMapValidator.Validate(map, t => ExportColumns(t, map), new Dictionary<string, IReadOnlySet<string>>()));
    }

    [Fact]
    public void Missing_table_and_column_are_reported_not_thrown()
    {
        var map = TestConfig.FieldMap;
        var warnings = FieldMapValidator.Validate(map, t => t switch
        {
            "nations" => null,
            "players" => ExportColumns(t, map)!.Where(c => c != "weakfootabilitytypecode" && c != "vision").ToHashSet(),
            _ => ExportColumns(t, map),
        }, new Dictionary<string, IReadOnlySet<string>>());

        Assert.Contains(warnings, w => w.Contains("raw_nations"));
        Assert.Contains(warnings, w => w.Contains("players.weakfootabilitytypecode") && w.Contains("player.weakFoot"));
        Assert.Contains(warnings, w => w.Contains("players.vision") && w.Contains("attributeGroups.Pas"));
        Assert.Equal(3, warnings.Count);
    }

    [Fact]
    public void Field_missing_from_game_schema_is_reported()
    {
        var map = TestConfig.FieldMap;
        var schema = new Dictionary<string, IReadOnlySet<string>>
        {
            ["teams"] = Set("teamid"), // teamname oyunun şemasında yok
        };
        var warnings = FieldMapValidator.Validate(map, t => ExportColumns(t, map), schema);
        Assert.Contains("Alan schema.json'da yok: teams.teamname (team.name)", warnings);
        Assert.All(warnings, w => Assert.StartsWith("Alan schema.json'da yok: teams.", w)); // yalnızca teams şemadan eksik
    }

    [Fact]
    public void Config_errors_are_reported()
    {
        var map = new FieldMap
        {
            Player = new() { ["id"] = "playerid" }, // table yok
            BirthdateEpoch = "14.10.1582",
            Positions = new() { ["x"] = "GK" },
            PositionGroups = new() { ["ATT"] = ["ST"] },
            GoalkeeperGroup = "Kaleci",
        };
        var warnings = FieldMapValidator.Validate(map, _ => Set("playerid"), new Dictionary<string, IReadOnlySet<string>>());
        Assert.Contains(warnings, w => w.StartsWith("player: 'table'"));
        Assert.Contains(warnings, w => w.Contains("birthdateEpoch"));
        Assert.Contains(warnings, w => w.Contains("positions: 'x'"));
        Assert.Contains(warnings, w => w.Contains("positionGroups.ATT: 'ST'"));
        Assert.Contains(warnings, w => w.Contains("goalkeeperGroup"));
    }

    [Fact]
    public void Unknown_position_code_gets_placeholder_label()
    {
        var map = TestConfig.FieldMap;
        Assert.Equal("P21", map.PositionLabel(21));
        Assert.Null(map.PositionLabel(-1));
        Assert.Null(map.PositionGroupOf("P21"));
        Assert.Equal("Sol", map.FootLabel(2));
        Assert.Equal("3", map.FootLabel(3));
    }

    [Fact]
    public void Only_official_play_styles_are_kept()
    {
        var map = TestConfig.FieldMap;
        Assert.Equal(36, map.PlayStyles.Count);
        // Üst kelimenin 0. ve 12. biti: 32 resmi, 44 eşlenmemiş iç bit.
        Assert.Equal([0, 32], PlayerAbilities.KnownStyleBits(map, 1, 1 | (1 << 12)));
    }

    [Fact]
    public void Competition_names_never_show_raw_codes()
    {
        var labels = TestConfig.FieldMap.CompetitionLabels;
        Assert.Equal("Dünya Kupası", CareerBlocks.CompetitionName("C1991", _ => null, labels));
        Assert.Equal("Test Ligi", CareerBlocks.CompetitionName("C68", _ => "Test Ligi", labels));
        Assert.Equal(CareerBlocks.UnknownCompetition, CareerBlocks.CompetitionName("C9999", _ => null, labels));
        Assert.Null(CareerBlocks.CompetitionName("", _ => null, labels));
    }
}
