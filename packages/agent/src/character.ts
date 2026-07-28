import characterJson from "@characters/doolittle.character.json" with {
  type: "json",
};
import { createCharacter } from "@elizaos/core";

export const character = createCharacter(characterJson);

export default character;
