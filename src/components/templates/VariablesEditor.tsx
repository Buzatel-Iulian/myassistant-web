import { Plus, Trash2 } from "lucide-react";

import { errorProps } from "@/components/common/errorProps";
import { FieldError } from "@/components/common/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** One editable row. `key` is a stable React key: names change while the user types. */
export interface VariableRow {
  key: number;
  name: string;
  label: string;
  defaultValue: string;
}

interface VariablesEditorProps {
  rows: VariableRow[];
  onChange: (rows: VariableRow[]) => void;
  onAdd: () => void;
  /** The API's field errors, keyed `variables[i].name` etc. (the row's index in the list that was sent). */
  errors: Record<string, string>;
}

const COLUMNS = [
  { field: "name", label: "Name", placeholder: "language" },
  { field: "label", label: "Label", placeholder: "Language" },
  { field: "defaultValue", label: "Default value", placeholder: "English" }
] as const;

export function VariablesEditor({ rows, onChange, onAdd, errors }: VariablesEditorProps) {
  const update = (index: number, field: keyof Omit<VariableRow, "key">, value: string) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  return (
    <div className="flex flex-col gap-3" data-testid="variables-editor">
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No variables yet. Write {"{{name}}"} in the content, then detect.
        </p>
      )}
      {rows.map((row, index) => (
        <div key={row.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
          {COLUMNS.map(column => {
            const id = `variable-${row.key}-${column.field}`;
            const error = errors[`variables[${index}].${column.field}`];
            return (
              <div key={column.field} className="flex flex-col gap-1">
                <Label htmlFor={id} className="text-xs">
                  {column.label}
                </Label>
                <Input
                  id={id}
                  value={row[column.field]}
                  placeholder={column.placeholder}
                  className={column.field === "name" ? "font-mono" : undefined}
                  onChange={event => update(index, column.field, event.target.value)}
                  {...errorProps(`${id}-error`, error)}
                />
                <FieldError id={`${id}-error`} message={error} />
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="self-end"
            aria-label={`Remove variable ${row.name || index + 1}`}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <FieldError id="variables-error" message={errors.variables} />
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus /> Add variable
        </Button>
      </div>
    </div>
  );
}
