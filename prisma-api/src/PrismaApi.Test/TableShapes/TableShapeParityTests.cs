using PrismaApi.Domain.TableShapes;

namespace PrismaApi.Test.TableShapes;

/// <summary>
/// Table shape parity: the pure builder must produce the shared fixtures' expected tables.
/// The UI's TypeScript port runs the same fixtures.
/// </summary>
public class TableShapeParityTests
{
    public static IEnumerable<object[]> FixtureNames() => TableShapeFixtures.Names();

    [Theory]
    [MemberData(nameof(FixtureNames))]
    public void RebuildAll_Fixture_ProducesExpectedTables(string name)
    {
        var fixture = TableShapeFixtures.Load(name);

        var tables = TableShapeBuilder.RebuildAll(fixture.Input);

        TableShapeFixtures.AssertMatchesExpected(fixture, tables);
    }
}
