export type DieType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";

export interface DieSpec {
  type: DieType;
  radius?: number;
  color?: number;
  labelColor?: string;
  emboss?: "recessed" | "raised" | false;
  embossStrength?: number;
}

export interface FullscreenDiceRollerOptions {
  fullscreen: true;
  transparent?: boolean;
  pointerEvents?: boolean;
  zIndex?: number;
  viewportWorldHeight?: number;
  floorY?: number;
  showFloor?: boolean;
  gravity?: number;
}

export interface ThrowOptions {
  from?:
    | "center"
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
  toward?: ThrowOptions["from"];
  velocity?: number;
  speed?: number;
  lift?: number;
  spin?: number;
  spread?: number;
  spacing?: number;
  height?: number;
  margin?: number;
  timeout?: number;
}

export class DiceRoller {
  constructor(options: FullscreenDiceRollerOptions);
  clear(): void;
  throwAndWait(dice: readonly DieSpec[], options?: ThrowOptions): Promise<string[]>;
  dispose(): void;
}
