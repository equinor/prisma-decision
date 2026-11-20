using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PrismaApi.Application.Interfaces.Services;
using PrismaApi.Application.Mapping;
using PrismaApi.Domain.Dtos;
using PrismaApi.Domain.Entities;
using PrismaApi.Domain.TableShapes;
using PrismaApi.Infrastructure.Context;
using PrismaApi.Test.Fixture;

namespace PrismaApi.Test.TableShapes;

/// <summary>
/// Runs the database-backed table rebuild against the shared Table shape fixtures,
/// so the service and the UI are held to the same expected tables.
/// Set TABLE_SHAPE_RECORD=1 to record the expected tables from the service.
/// </summary>
[Collection(nameof(PrismaCollection))]
public class TableRebuildingServiceFixtureTests : PrismaApiControllerTestBase
{
    public TableRebuildingServiceFixtureTests(PrismaApiFixture fixture) : base(fixture)
    {
    }

    public static IEnumerable<object[]> FixtureNames() => TableShapeFixtures.Names();

    [Theory]
    [MemberData(nameof(FixtureNames))]
    public async Task RebuildTablesAsync_Fixture_ProducesExpectedTables(string name)
    {
        var fixture = TableShapeFixtures.Load(name);
        await SeedAsync(fixture.Input);

        using (var scope = Fixture.ApiFactory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var rebuilder = scope.ServiceProvider.GetRequiredService<ITableRebuildingService>();
            db.DiscreteTableSessionInfo.AffectedIssueIds.UnionWith(fixture.Input.Issues.Select(issue => issue.Id));
            db.DiscreteTableSessionInfo.AffectedRestrictionTables.UnionWith(
                await db.RestrictionTables.Select(table => table.Id).ToListAsync());
            await rebuilder.RebuildTablesAsync();
        }

        TableShapeFixtures.AssertMatchesExpected(fixture, await ReadTablesAsync(fixture.Input));
    }

    private async Task SeedAsync(TableShapeProject input)
    {
        using var scope = Fixture.ApiFactory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.IsDiscreteTableEventDisabled = true;
        var userId = Fixture.PrismaUser.Id!;
        var projectId = input.Issues.Select(issue => issue.ProjectId).First();

        db.Projects.Add(new Project
        {
            Id = projectId,
            Name = "Table shape fixture",
            CreatedById = userId,
            UpdatedById = userId,
        });

        foreach (var (issue, order) in input.Issues.Select((issue, order) => (issue, order)))
        {
            db.Issues.Add(new Issue
            {
                Id = issue.Id,
                ProjectId = projectId,
                Type = issue.Type,
                Boundary = issue.Boundary,
                Name = $"Issue {order}",
                Description = "Table shape fixture issue",
                Order = order,
                CreatedById = userId,
                UpdatedById = userId,
            });
            if (issue.Node != null)
            {
                db.Nodes.Add(new Node { Id = issue.Node.Id, ProjectId = projectId, IssueId = issue.Id, Name = $"Issue {order}" });
            }
            if (issue.Uncertainty != null)
            {
                db.Uncertainties.Add(new Uncertainty
                {
                    Id = issue.Uncertainty.Id,
                    IssueId = issue.Id,
                    ProjectId = projectId,
                    IsKey = issue.Uncertainty.IsKey,
                });
                db.Outcomes.AddRange(issue.Uncertainty.Outcomes.Select((outcome, index) => new Outcome
                {
                    Id = outcome.Id,
                    UncertaintyId = issue.Uncertainty.Id,
                    ProjectId = projectId,
                    Name = $"Outcome {index}",
                }));
            }
            if (issue.Decision != null)
            {
                db.Decisions.Add(new Decision
                {
                    Id = issue.Decision.Id,
                    IssueId = issue.Id,
                    ProjectId = projectId,
                    Type = issue.Decision.Type ?? string.Empty,
                });
                db.Options.AddRange(issue.Decision.Options.Select((option, index) => new Option
                {
                    Id = option.Id,
                    DecisionId = issue.Decision.Id,
                    ProjectId = projectId,
                    Name = $"Option {index}",
                }));
            }
            if (issue.Utility != null)
            {
                db.Utilities.Add(new Utility { Id = issue.Utility.Id, IssueId = issue.Id, ProjectId = projectId });
            }
        }

        db.Edges.AddRange(input.Edges.Select(edge => new Edge
        {
            Id = edge.Id,
            ProjectId = projectId,
            TailId = edge.TailId,
            HeadId = edge.HeadId,
        }));

        // Cells referencing deleted States, Issues or edges are removed by database cleanup before a rebuild runs,
        // so they are never seen by the service.
        var stateIds = input.Issues
            .SelectMany(issue => (issue.Uncertainty?.Outcomes ?? []).Concat(issue.Decision?.Options ?? []))
            .Select(state => state.Id)
            .ToHashSet();
        var uncertaintyIds = input.Issues.Where(issue => issue.Uncertainty != null).Select(issue => issue.Uncertainty!.Id).ToHashSet();
        var utilityIds = input.Issues.Where(issue => issue.Utility != null).Select(issue => issue.Utility!.Id).ToHashSet();
        var edgeIds = input.Edges.Select(edge => edge.Id).ToHashSet();

        db.DiscreteProbabilities.AddRange(input.DiscreteProbabilities
            .Where(probability =>
                uncertaintyIds.Contains(probability.UncertaintyId) &&
                stateIds.Contains(probability.OutcomeId) &&
                probability.ParentOutcomeIds.Concat(probability.ParentOptionIds).All(stateIds.Contains))
            .Select(probability => probability.ToEntity()));
        db.DiscreteUtilities.AddRange(input.DiscreteUtilities
            .Where(utility =>
                utilityIds.Contains(utility.UtilityId) &&
                utility.ParentOutcomeIds.Concat(utility.ParentOptionIds).All(stateIds.Contains))
            .Select(utility => utility.ToEntity()));
        db.RestrictionTables.AddRange(input.RestrictionTables
            .Where(table => edgeIds.Contains(table.EdgeId))
            .Select(table => new RestrictionTable
            {
                Id = table.Id,
                ProjectId = projectId,
                EdgeId = table.EdgeId,
                Name = table.Name,
                CreatedById = userId,
                UpdatedById = userId,
                RestrictionEntries = table.RestrictionEntries
                    .Where(entry =>
                        entry.ParentStateId is Guid parentStateId && stateIds.Contains(parentStateId) &&
                        entry.ChildStateId is Guid childStateId && stateIds.Contains(childStateId))
                    .Select(entry => new RestrictionEntry
                    {
                        Id = entry.Id,
                        ProjectId = projectId,
                        RestrictionTableId = table.Id,
                        RestrictionValue = entry.RestrictionValue,
                        ParentOutcomeId = entry.IsParentUncertainty ? entry.ParentStateId : null,
                        ParentOptionId = entry.IsParentUncertainty ? null : entry.ParentStateId,
                        ChildOutcomeId = entry.IsChildUncertainty ? entry.ChildStateId : null,
                        ChildOptionId = entry.IsChildUncertainty ? null : entry.ChildStateId,
                    })
                    .ToList(),
            }));

        await db.SaveChangesAsync();
    }

    private async Task<TableShapeTables> ReadTablesAsync(TableShapeProject input)
    {
        using var scope = Fixture.ApiFactory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var projectId = input.Issues.Select(issue => issue.ProjectId).First();

        var probabilities = await db.DiscreteProbabilities
            .Where(probability => probability.ProjectId == projectId)
            .Include(probability => probability.ParentOutcomes)
            .Include(probability => probability.ParentOptions)
            .AsNoTracking()
            .ToListAsync();
        var utilities = await db.DiscreteUtilities
            .Where(utility => utility.ProjectId == projectId)
            .Include(utility => utility.ParentOutcomes)
            .Include(utility => utility.ParentOptions)
            .AsNoTracking()
            .ToListAsync();
        var restrictionTables = await db.RestrictionTables
            .Where(table => table.ProjectId == projectId)
            .Include(table => table.RestrictionEntries)
            .AsNoTracking()
            .ToListAsync();

        return new TableShapeTables
        {
            DiscreteProbabilities = probabilities.ToDtos(),
            DiscreteUtilities = utilities.ToDtos(),
            RestrictionTables = restrictionTables.Select(table => new RestrictionTableIncomingDto
            {
                Id = table.Id,
                ProjectId = table.ProjectId,
                EdgeId = table.EdgeId,
                Name = table.Name,
                RestrictionEntries = table.RestrictionEntries.ToOutgoingDtos()
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
                    .ToList(),
            }).ToList(),
        };
    }
}
