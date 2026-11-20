using PrismaApi.Domain.Entities;
using PrismaApi.Domain.TableShapes;

namespace PrismaApi.Application.Mapping;

public static class TableShapeMappingExtensions
{
    public static TableShapeIssue ToTableShapeIssue(this Issue entity)
    {
        return new TableShapeIssue
        {
            Id = entity.Id,
            ProjectId = entity.ProjectId,
            Type = entity.Type,
            Boundary = entity.Boundary,
            Node = entity.Node == null ? null : new TableShapeNode { Id = entity.Node.Id },
            Uncertainty = entity.Uncertainty == null ? null : new TableShapeUncertainty
            {
                Id = entity.Uncertainty.Id,
                IsKey = entity.Uncertainty.IsKey,
                Outcomes = entity.Uncertainty.Outcomes.Select(outcome => new TableShapeState { Id = outcome.Id }).ToList(),
            },
            Decision = entity.Decision == null ? null : new TableShapeDecision
            {
                Id = entity.Decision.Id,
                Type = entity.Decision.Type,
                Options = entity.Decision.Options.Select(option => new TableShapeState { Id = option.Id }).ToList(),
            },
            Utility = entity.Utility == null ? null : new TableShapeUtility { Id = entity.Utility.Id },
        };
    }
}
