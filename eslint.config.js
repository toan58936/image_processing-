import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "samples/**",
      "output/**",
      "node_modules/**",
      ".kilo/**",
    ],
  },
  ...tseslint.configs.recommended
);
