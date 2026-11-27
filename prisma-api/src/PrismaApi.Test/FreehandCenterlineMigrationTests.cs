using System.Data.Common;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Caching.Memory;
using PrismaApi.Domain.Constants;
using PrismaApi.Domain.Entities;
using PrismaApi.Infrastructure.Context;

namespace PrismaApi.Test;

public class FreehandCenterlineMigrationTests : IAsyncLifetime
{
    // Captured from the previous perfect-freehand writer for a curved pointer stroke.
    private const string CurvedOutline =
        "M0.41,-0.51 Q30.98,24.19 65.39,11.83 T99.90,-0.54 100.08,-0.54 100.25,-0.49 " +
        "100.39,-0.39 100.50,-0.24 100.55,-0.07 100.54,0.11 100.48,0.28 100.36,0.41 " +
        "100.21,0.51 100.04,0.55 99.86,0.53 99.70,0.46 99.57,0.34 99.48,0.19 " +
        "99.45,0.01 99.48,-0.17 99.56,-0.33 99.68,-0.45 99.84,-0.53 100.02,-0.55 " +
        "100.19,-0.51 100.35,-0.43 100.47,-0.29 100.54,-0.13 100.55,0.05 100.50,0.22 " +
        "100.41,0.37 100.27,0.48 100.19,0.53 65.48,12.87 15.18,12.86 -0.46,0.45 " +
        "-0.56,0.33 -0.62,0.19 -0.65,0.03 -0.64,-0.12 -0.59,-0.27 -0.51,-0.41 " +
        "-0.40,-0.52 -0.26,-0.60 -0.11,-0.64 0.05,-0.65 0.20,-0.62 0.34,-0.55 Z";

    private readonly MemoryCache _cache = new(new MemoryCacheOptions());
    private readonly AppDbContext _db;
    private readonly Guid _projectId = Guid.NewGuid();
    private readonly Guid _sheetId = Guid.NewGuid();

    public FreehandCenterlineMigrationTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>();
        var sqlServer = Environment.GetEnvironmentVariable("FREEHAND_MIGRATION_SQLSERVER");
        if (string.IsNullOrEmpty(sqlServer))
        {
            options.UseSqlite("Data Source=:memory:", sql => sql.MigrationsAssembly("SqliteMigrations"));
        }
        else
        {
            var connection = new SqlConnectionStringBuilder(sqlServer)
            {
                InitialCatalog = $"FreehandMigration_{Guid.NewGuid():N}",
            };
            options.UseSqlServer(connection.ConnectionString, sql => sql.MigrationsAssembly("SqlServerMigrations"));
        }
        _db = new AppDbContext(options.Options, _cache, new AppDbContextOptions());
    }

    public async Task InitializeAsync()
    {
        if (_db.Database.IsSqlite())
        {
            await _db.Database.OpenConnectionAsync();
        }
        await _db.GetService<IMigrator>().MigrateAsync("AddStakeholderMatrixEntries");
        _db.Projects.Add(new Project
        {
            Id = _projectId,
            Name = "Freehand migration",
            CreatedById = DomainConstants.DeletedUserId,
            UpdatedById = DomainConstants.DeletedUserId,
        });
        _db.BoardSheets.Add(new BoardSheet
        {
            Id = _sheetId,
            ProjectId = _projectId,
            CreatedById = DomainConstants.DeletedUserId,
            UpdatedById = DomainConstants.DeletedUserId,
        });
        await _db.SaveChangesAsync();
    }

    [Theory]
    [InlineData("Solid")]
    [InlineData("Dashed")]
    [InlineData("Dotted")]
    public async Task MigrateAsync_ClosedFreehandOutline_ConvertsPathAndPreservesOtherProperties(string style)
    {
        var node = AddNode(CurvedOutline, style);
        await _db.SaveChangesAsync();
        var expected = _db.Entry(node).CurrentValues.Clone();

        await _db.Database.MigrateAsync();
        _db.ChangeTracker.Clear();
        var migrated = await _db.BoardNodes.SingleAsync();
        var points = ReadPoints(migrated.Data);

        Assert.StartsWith("M", migrated.Data);
        Assert.DoesNotContain("Z", migrated.Data, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(1, migrated.Data.Count(character => character == 'M'));
        Assert.True(points.Count > 10);
        Assert.InRange(points[^1].X, 98, 102);
        Assert.All(points.Where(point => point.X is > 45 and < 55),
            point => Assert.InRange(point.Y, 12, 18));
        Assert.InRange(points.Max(point => point.Y), 14, 18);
        expected[nameof(BoardNode.Data)] = migrated.Data;
        Assert.Equivalent(expected.ToObject(), migrated);
    }

    [Fact]
    public async Task MigrateAsync_MixedBoardNodes_LeavesOtherFormatsUnchangedAndDoesNotRunAgain()
    {
        const string open = "M0.00,5.00 Q10.00,10.00 20.00,5.00 L30.00,0.00";
        const string closed = "M0,0 Q0,0 50,0 T100,0 100,2 50,2 0,2 Z";
        var centerline = AddNode(open);
        var other = AddNode(closed);
        other.Type = "Text";
        var empty = AddNode("");
        var outline = AddNode(closed);
        await _db.SaveChangesAsync();

        await _db.Database.MigrateAsync();
        _db.ChangeTracker.Clear();
        var migrated = await _db.BoardNodes.ToDictionaryAsync(node => node.Id, node => node.Data);
        Assert.Equal(open, migrated[centerline.Id]);
        Assert.Equal(closed, migrated[other.Id]);
        Assert.Equal("", migrated[empty.Id]);
        Assert.NotEqual(closed, migrated[outline.Id]);

        // A later restore/import must not cause the migration to execute a second time.
        await _db.BoardNodes.Where(node => node.Id == outline.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(node => node.Data, closed));
        await _db.Database.MigrateAsync();
        Assert.Equal(closed, await _db.BoardNodes.Where(node => node.Id == outline.Id)
            .Select(node => node.Data).SingleAsync());
    }

    [Fact]
    public async Task MigrateAsync_LongAndZeroLengthOutlines_ProducesFiniteBoundedOpenPaths()
    {
        var dot = AddNode("M10,20 Q10,20 10,20 T10,20 Z");
        var longStroke = AddNode("M0,0 Q0,0 50,0 T" +
            string.Join(" ", Enumerable.Range(2, 200).Select(index => $"{index * 50},0")) +
            " 10000,2 " +
            string.Join(" ", Enumerable.Range(0, 200).Reverse().Select(index => $"{index * 50},2")) +
            " Z");
        await _db.SaveChangesAsync();

        await _db.Database.MigrateAsync();
        _db.ChangeTracker.Clear();
        var migrated = await _db.BoardNodes.ToDictionaryAsync(node => node.Id, node => node.Data);

        Assert.Equal("M10.00,20.00 L10.00,20.00", migrated[dot.Id]);
        var points = ReadPoints(migrated[longStroke.Id]);
        Assert.InRange(points.Count, 2, 2049);
        Assert.DoesNotContain("Z", migrated[longStroke.Id]);
        Assert.All(points, point =>
        {
            Assert.True(double.IsFinite(point.X));
            Assert.True(double.IsFinite(point.Y));
        });
    }

    [Fact]
    public async Task MigrateAsync_InvalidOutline_RollsBackWithoutRecordingMigration()
    {
        var invalid = AddNode("Mnot-a-point Q0,0 1,1 T2,2 Z");
        var valid = AddNode("M0,0 Q0,0 50,0 T100,0 100,2 50,2 0,2 Z");
        await _db.SaveChangesAsync();

        await Assert.ThrowsAnyAsync<DbException>(() => _db.Database.MigrateAsync());

        _db.ChangeTracker.Clear();
        var unchanged = await _db.BoardNodes.ToDictionaryAsync(node => node.Id, node => node.Data);
        Assert.Equal(invalid.Data, unchanged[invalid.Id]);
        Assert.Equal(valid.Data, unchanged[valid.Id]);
        Assert.Contains(await _db.Database.GetPendingMigrationsAsync(),
            name => name.EndsWith("_ConvertFreehandOutlinesToCenterlines"));

        await _db.BoardNodes.Where(node => node.Id == invalid.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(node => node.Data, CurvedOutline));
        await _db.Database.MigrateAsync();
        Assert.Empty(await _db.Database.GetPendingMigrationsAsync());
    }

    private BoardNode AddNode(string data, string style = "Solid")
    {
        var node = new BoardNode
        {
            Id = Guid.NewGuid(),
            ProjectId = _projectId,
            BoardSheetId = _sheetId,
            CreatedById = DomainConstants.DeletedUserId,
            UpdatedById = DomainConstants.DeletedUserId,
            Type = "Freehand",
            Data = data,
            StrokeStyle = style,
            StrokeWidth = 6,
            Color = "#ff9200",
            Opacity = 25,
            Width = 104,
            Height = 6,
            XPosition = -30,
            YPosition = 40,
            Rotation = 15,
            ZIndex = 3,
        };
        _db.BoardNodes.Add(node);
        return node;
    }

    private static List<(double X, double Y)> ReadPoints(string path) =>
        Regex.Matches(path, @"(-?\d+\.\d+),(-?\d+\.\d+)")
            .Select(match => (
                double.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture),
                double.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture)))
            .ToList();

    public async Task DisposeAsync()
    {
        await _db.Database.EnsureDeletedAsync();
        await _db.DisposeAsync();
        _cache.Dispose();
    }
}
