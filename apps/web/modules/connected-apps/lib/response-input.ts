type ResponseValues = { id: string; data: Record<string, unknown>; createdAt: Date | string };
/** Whole-value placeholders preserve arrays and numbers required by the catalogue schema. */
export const mapResponseInput = (
  input: Record<string, unknown>,
  response: ResponseValues,
  surveyName: string
): Record<string, unknown> => {
  const visit = (value: unknown): unknown => {
    if (value === "{{response.id}}") return response.id;
    if (value === "{{response.createdAt}}") return new Date(response.createdAt).toISOString();
    if (value === "{{survey.name}}") return surveyName;
    if (value === "{{answers}}") return response.data;
    if (typeof value === "string") {
      const match = /^\{\{answers\.([^{}]+)\}\}$/.exec(value);
      return match ? (response.data[match[1]] ?? "") : value;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
    return value;
  };
  return visit(input) as Record<string, unknown>;
};
