using System.Text.Json;
using System.Text.Json.Nodes;
using PrismaApi.Domain.Dtos;
using PrismaApi.Domain.TableShapes;

namespace PrismaApi.Test.TableShapes;

public sealed record TableShapeFixture(string Name, string FilePath, TableShapeProject Input, JsonNode? Expected);

/// <summary>
/// Loads the shared Table shape fixtures that both the API and the UI must satisfy.
/// </summary>
public static class TableShapeFixtures
{
    public const string RecordVariable = "TABLE_SHAPE_RECORD";

    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        IndentCharacter = '\t',
        IndentSize = 1,
    };

    public static string Directory { get; } = FindFixtureDirectory();

    public static IEnumerable<object[]> Names() =>
        System.IO.Directory.GetFiles(Directory, "*.json")
            .Select(Path.GetFileNameWithoutExtension)
            .Order(StringComparer.Ordinal)
            .Select(name => new object[] { name! });

    public static TableShapeFixture Load(string name)
    {
        var filePath = Path.Combine(Directory, $"{name}.json");
        var root = JsonNode.Parse(File.ReadAllText(filePath))!;
        var input = root["input"].Deserialize<TableShapeProject>()
            ?? throw new InvalidOperationException($"Fixture {name} has no input");
        return new TableShapeFixture(name, filePath, input, root["expected"]);
    }

    /// <summary>
    /// Compares the tables with the fixture's expected tables as canonical, ID-ordered sets.
    /// When <see cref="RecordVariable"/> is set, the expected tables are recorded instead.
    /// </summary>
    public static void AssertMatchesExpected(TableShapeFixture fixture, TableShapeTables actual)
    {
        var canonical = Canonicalize(actual);
        if (Environment.GetEnvironmentVariable(RecordVariable) == "1")
        {
            var root = JsonNode.Parse(File.ReadAllText(fixture.FilePath))!;
            root["expected"] = canonical;
            File.WriteAllText(fixture.FilePath, root.ToJsonString(WriteOptions) + "\n");
            return;
        }

        Assert.NotNull(fixture.Expected);
        Assert.True(
            JsonNode.DeepEquals(fixture.Expected, canonical),
            $"Table shape mismatch for fixture '{fixture.Name}'.\nExpected:\n{fixture.Expected!.ToJsonString(WriteOptions)}\nActual:\n{canonical.ToJsonString(WriteOptions)}");
    }

    public static JsonNode Canonicalize(TableShapeTables tables)
    {
        var canonical = new TableShapeTables
        {
            DiscreteProbabilities = tables.DiscreteProbabilities
                .Select(probability => new DiscreteProbabilityDto
                {
                    Id = probability.Id,
                    OutcomeId = probability.OutcomeId,
                    UncertaintyId = probability.UncertaintyId,
                    ProjectId = probability.ProjectId,
                    Probability = probability.Probability,
                    ParentOutcomeIds = SortIds(probability.ParentOutcomeIds),
                    ParentOptionIds = SortIds(probability.ParentOptionIds),
                })
                .OrderBy(probability => probability.Id.ToString(), StringComparer.Ordinal)
                .ToList(),
            DiscreteUtilities = tables.DiscreteUtilities
                .Select(utility => new DiscreteUtilityDto
                {
                    Id = utility.Id,
                    ValueMetricId = utility.ValueMetricId,
                    UtilityId = utility.UtilityId,
                    ProjectId = utility.ProjectId,
                    UtilityValue = utility.UtilityValue,
                    ParentOutcomeIds = SortIds(utility.ParentOutcomeIds),
                    ParentOptionIds = SortIds(utility.ParentOptionIds),
                })
                .OrderBy(utility => utility.Id.ToString(), StringComparer.Ordinal)
                .ToList(),
            RestrictionTables = tables.RestrictionTables
                .Select(table => new RestrictionTableIncomingDto
                {
                    Id = table.Id,
                    ProjectId = table.ProjectId,
                    EdgeId = table.EdgeId,
                    Name = table.Name,
                    RestrictionEntries = table.RestrictionEntries
                        .Select(entry => new RestrictionEntryIncomingDto
                        {
                            Id = entry.Id,
                            ProjectId = entry.ProjectId,
                            RestrictionTableId = entry.RestrictionTableId,
                            RestrictionValue = entry.RestrictionValue,
                            ParentStateId = entry.ParentStateId,
                            IsParentUncertainty = entry.IsParentUncertainty,
                            ChildStateId = entry.ChildStateId,
                            IsChildUncertainty = entry.IsChildUncertainty,
                        })
                        .OrderBy(entry => entry.Id.ToString(), StringComparer.Ordinal)
                        .ToList(),
                })
                .OrderBy(table => table.Id.ToString(), StringComparer.Ordinal)
                .ToList(),
        };
        return JsonSerializer.SerializeToNode(canonical)!;
    }

    private static List<Guid> SortIds(IEnumerable<Guid> ids) =>
        ids.OrderBy(id => id.ToString(), StringComparer.Ordinal).ToList();

    private static string FindFixtureDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null)
        {
            var candidate = Path.Combine(directory.FullName, "test-fixtures", "table-shape");
            if (System.IO.Directory.Exists(candidate))
            {
                return candidate;
            }
            directory = directory.Parent;
        }
        throw new DirectoryNotFoundException("Could not find test-fixtures/table-shape above the test output directory.");
    }
}
