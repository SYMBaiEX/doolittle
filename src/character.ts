import { createCharacter } from "@elizaos/core";
import characterJson from "../characters/eliza-agent.character.json";

export const character = createCharacter(characterJson);

export default character;
