import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@doolittle/ui";
import type {
  AccountPoolProvider,
  AccountPoolStrategy,
} from "../../shared/contracts";

const strategies: {
  value: AccountPoolStrategy;
  label: string;
  description: string;
}[] = [
  {
    value: "priority",
    label: "Priority",
    description: "Always prefer the top healthy account.",
  },
  {
    value: "round-robin",
    label: "Round-robin",
    description: "Alternate across enabled accounts.",
  },
  {
    value: "least-used",
    label: "Least used",
    description: "Prefer the account with the lowest current usage.",
  },
  {
    value: "quota-aware",
    label: "Quota-aware",
    description: "Skip accounts above 85% utilization.",
  },
];

export function RotationStrategyPicker({
  providerId,
  value = "priority",
  onChange,
  disabled,
}: {
  providerId: AccountPoolProvider;
  value?: AccountPoolStrategy;
  onChange: (value: AccountPoolStrategy) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const strategy = strategies.find((option) => option.value === next);
        if (strategy && strategy.value !== value) onChange(strategy.value);
      }}
    >
      <SelectTrigger id={`rotation-strategy-${providerId}`} className="w-40">
        <SelectValue>
          {strategies.find((option) => option.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {strategies.map((option) => (
          <SelectItem
            key={option.value}
            textValue={option.label}
            value={option.value}
          >
            <span className="grid gap-0.5">
              <span>{option.label}</span>
              <small className="text-[var(--muted)]">
                {option.description}
              </small>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
