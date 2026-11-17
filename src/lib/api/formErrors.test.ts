import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import { configurationFormErrors, templateFormErrors, variableValueKey } from "@/lib/api/formErrors";
import type { ProblemDetail } from "@/lib/types";

const invalid = (fieldErrors: Record<string, string>) =>
  new ApiError(400, "Bad Request", "Some fields are invalid.", fieldErrors, { status: 400, fieldErrors });
const problem = (status: number, detail: string, body: ProblemDetail) =>
  new ApiError(status, "Bad Request", detail, {}, { status, detail, ...body });

const variables = [
  { name: "language", label: null, defaultValue: null },
  { name: "level", label: null, defaultValue: null },
  { name: "language", label: null, defaultValue: null }
];

describe("templateFormErrors", () => {
  it("keeps top-level and indexed variable keys as they come", () => {
    const errors = templateFormErrors(
      invalid({
        name: "must not be blank",
        "variables[1].name": "must start with a letter",
        "variables[0].defaultValue": "size must be between 0 and 1000",
        variables: "size must be between 0 and 20"
      }),
      variables
    );
    expect(errors).toEqual({
      fields: {
        name: "must not be blank",
        "variables[1].name": "must start with a letter",
        "variables[0].defaultValue": "size must be between 0 and 1000",
        variables: "size must be between 0 and 20"
      },
      form: null
    });
  });

  it("puts unknown placeholders on the content field", () => {
    const error = problem(400, "The content uses placeholders …", { unknownPlaceholders: ["tone", " x "] });
    expect(templateFormErrors(error, variables).fields.content).toBe(
      "Not declared as variables: {{tone}}, {{ x }}. Add them below (Detect variables) or remove them."
    );
    expect(templateFormErrors(error, variables).form).toBeNull();
  });

  it("marks every row whose name is duplicated", () => {
    const error = problem(400, "Variable names must be unique …", {
      unknownPlaceholders: [],
      duplicateVariables: ["language"]
    });
    expect(templateFormErrors(error, variables)).toEqual({
      fields: {
        "variables[0].name": "is declared more than once",
        "variables[2].name": "is declared more than once"
      },
      form: null
    });
  });

  it("shows the detail when nothing points at a field", () => {
    const error = new ApiError(500, "Error", "Something went wrong. Try again later.");
    expect(templateFormErrors(error, [])).toEqual({ fields: {}, form: "Something went wrong. Try again later." });
  });

  it("does not lose an error for a field the form does not show", () => {
    const errors = templateFormErrors(invalid({ version: "must not be null", name: "too long" }), []);
    expect(errors.fields).toEqual({ name: "too long" });
    expect(errors.form).toBe("Some fields are invalid. version: must not be null.");
  });

  it("ignores problem members that are not lists of names", () => {
    const error = problem(400, "Bad", { unknownPlaceholders: "oops" as unknown as string[] });
    expect(templateFormErrors(error, variables)).toEqual({ fields: {}, form: "Bad" });
  });
});

describe("configurationFormErrors", () => {
  it("keeps nested settings keys and map entry keys", () => {
    const errors = configurationFormErrors(
      invalid({
        "settings.maxTokens": "must be less than the context window size",
        "settings.temperature": "must be less than or equal to 2",
        modelId: "must be a WebLLM model id ending in -MLC",
        "variableValues[language]": "size must be between 0 and 1000"
      })
    );
    expect(errors.form).toBeNull();
    expect(errors.fields["settings.maxTokens"]).toBe("must be less than the context window size");
    expect(errors.fields[variableValueKey("language")]).toBe("size must be between 0 and 1000");
    expect(Object.keys(errors.fields)).toHaveLength(4);
  });

  it("puts unknown variables on the variable values", () => {
    const error = problem(400, "The template does not declare these variables: a, b.", {
      unknownVariables: ["a", "b"]
    });
    expect(configurationFormErrors(error)).toEqual({
      fields: { variableValues: "The template does not declare: a, b" },
      form: null
    });
  });

  it("puts a missing template on the template field", () => {
    const error = new ApiError(404, "Not Found", "No template with id t1");
    expect(configurationFormErrors(error)).toEqual({ fields: { templateId: "No template with id t1" }, form: null });
  });

  it("keeps a stale-version 409 for the form", () => {
    const error = new ApiError(409, "Conflict", "This item was changed in another tab. Reload it and try again.");
    expect(configurationFormErrors(error)).toEqual({
      fields: {},
      form: "This item was changed in another tab. Reload it and try again."
    });
  });
});
