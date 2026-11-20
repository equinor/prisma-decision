using System.Text.Json.Serialization;
using PrismaApi.Domain.Dtos;

namespace PrismaApi.Domain.TableShapes;

/// <summary>
/// The minimal view of an Issue needed to determine Table shapes.
/// Mirrors the Issue shape used by the UI so both implementations read the same fixtures.
/// </summary>
public sealed class TableShapeIssue
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
    [JsonPropertyName("project_id")]
    public Guid ProjectId { get; set; }
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;
    [JsonPropertyName("boundary")]
    public string Boundary { get; set; } = string.Empty;
    [JsonPropertyName("node")]
    public TableShapeNode? Node { get; set; }
    [JsonPropertyName("uncertainty")]
    public TableShapeUncertainty? Uncertainty { get; set; }
    [JsonPropertyName("decision")]
    public TableShapeDecision? Decision { get; set; }
    [JsonPropertyName("utility")]
    public TableShapeUtility? Utility { get; set; }
}

public sealed class TableShapeNode
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
}

public sealed class TableShapeState
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
}

public sealed class TableShapeUncertainty
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
    [JsonPropertyName("is_key")]
    public bool IsKey { get; set; }
    [JsonPropertyName("outcomes")]
    public List<TableShapeState> Outcomes { get; set; } = [];
}

public sealed class TableShapeDecision
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
    [JsonPropertyName("type")]
    public string? Type { get; set; }
    [JsonPropertyName("options")]
    public List<TableShapeState> Options { get; set; } = [];
}

public sealed class TableShapeUtility
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
}

public sealed class TableShapeEdge
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
    [JsonPropertyName("tail_id")]
    public Guid TailId { get; set; }
    [JsonPropertyName("head_id")]
    public Guid HeadId { get; set; }
}

/// <summary>
/// The Probability, Utility and Restriction tables of a project.
/// </summary>
public class TableShapeTables
{
    [JsonPropertyName("discrete_probabilities")]
    public List<DiscreteProbabilityDto> DiscreteProbabilities { get; set; } = [];
    [JsonPropertyName("discrete_utilities")]
    public List<DiscreteUtilityDto> DiscreteUtilities { get; set; } = [];
    [JsonPropertyName("restriction_tables")]
    public List<RestrictionTableIncomingDto> RestrictionTables { get; set; } = [];
}

/// <summary>
/// Everything that determines the Table shapes of a project, together with the current tables.
/// </summary>
public sealed class TableShapeProject : TableShapeTables
{
    [JsonPropertyName("issues")]
    public List<TableShapeIssue> Issues { get; set; } = [];
    [JsonPropertyName("edges")]
    public List<TableShapeEdge> Edges { get; set; } = [];
}
