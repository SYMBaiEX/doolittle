export interface PersonalityProfile {
  id: string;
  name: string;
  description: string;
  systemAddendum: string;
}

export interface PersonalityServiceLike {
  list(): PersonalityProfile[];
  get(id: string): PersonalityProfile | undefined;
  setActive(id: string): PersonalityProfile;
  activeId(): string;
}
