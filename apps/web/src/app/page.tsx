import { CharacterManager } from "../components/character-manager";
import { loadWebData } from "../lib/server-data";

export default function Home() {
  const data = loadWebData();
  return <CharacterManager {...data} />;
}
