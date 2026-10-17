export type MoodId = "tired" | "stressed" | "starving" | "light" | "treat" | "quick" | "cold";

export const MOODS: readonly {
  id: MoodId;
  label: string;
  wants: string[];
  avoids: string[];
}[] = [
  { id: "tired", label: "Tired", wants: ["hot", "drink", "quick"], avoids: [] },
  { id: "stressed", label: "Stressed", wants: ["sweet", "hot", "snack"], avoids: [] },
  { id: "starving", label: "Starving", wants: ["filling", "meal"], avoids: ["light"] },
  { id: "light", label: "Something light", wants: ["light"], avoids: ["heavy"] },
  { id: "treat", label: "Treat myself", wants: ["sweet", "heavy"], avoids: [] },
  { id: "quick", label: "In a hurry", wants: ["quick"], avoids: [] },
  { id: "cold", label: "Cold day", wants: ["hot", "spicy", "drink"], avoids: ["cold"] },
];
