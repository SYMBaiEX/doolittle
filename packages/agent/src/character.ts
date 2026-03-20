import characterJson from "@characters/eliza-agent.character.json";
import { createCharacter } from "@elizaos/core";

export const character = createCharacter(characterJson);

export default character;
