import {
  Anchor,
  BookOpen,
  Bot,
  Briefcase,
  Bug,
  Code,
  Compass,
  Database,
  FlaskConical,
  Folder,
  GitBranch,
  Globe,
  Image,
  Layers,
  type LucideIcon,
  Map as MapIcon,
  MapPin,
  Package,
  Palette,
  Rocket,
  Search,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";
import { UiIcon, type UiIconSize } from "../components/UiIcon";
import { type ProjectLike, projectLabel } from "./models";

// Project metadata accepts a compact, curated icon vocabulary rather than
// indexing every Lucide export into the desktop bundle. Unknown legacy values
// fall back to projectLabel instead of rendering their raw names.
const PROJECT_NAMED_ICONS: Record<string, LucideIcon> = {
  anchor: Anchor,
  "book-open": BookOpen,
  bot: Bot,
  briefcase: Briefcase,
  bug: Bug,
  code: Code,
  compass: Compass,
  database: Database,
  "flask-conical": FlaskConical,
  folder: Folder,
  "git-branch": GitBranch,
  globe: Globe,
  image: Image,
  layers: Layers,
  map: MapIcon,
  "map-pin": MapPin,
  package: Package,
  palette: Palette,
  rocket: Rocket,
  search: Search,
  "shield-check": ShieldCheck,
  terminal: Terminal,
  wrench: Wrench,
};

export function resolveProjectIcon(icon?: string): LucideIcon | undefined {
  const key = icon
    ?.trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
  return key ? PROJECT_NAMED_ICONS[key] : undefined;
}

export function ProjectIconGlyph({
  project,
  size,
}: {
  project: ProjectLike;
  size: UiIconSize;
}) {
  const Icon = resolveProjectIcon(project.icon);
  if (Icon) return <UiIcon icon={Icon} size={size} />;
  return <>{projectLabel(project)}</>;
}
