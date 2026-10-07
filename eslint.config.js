import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "samples/**", "node_modules/**"] },
  ...tseslint.configs.recommended
);
