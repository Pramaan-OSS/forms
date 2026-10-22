import library from "@forms/config-eslint/library";

/**
 * This package is the vendored Pramaan client (kept close to its upstream
 * shape so platform contract fixes port cleanly). The rules below fight that
 * vendored style — namespace-typed contracts, `unknown`-routed fixtures and
 * await-less fetch stubs in tests — and are relaxed here, for this package
 * only. Everything else (unused vars, imports, formatting) stays on.
 */
export default [
  ...library({ tsconfigRootDir: import.meta.dirname }),
  {
    rules: {
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/require-await": "off",
      "require-yield": "off",
      "no-empty": "off",
    },
  },
];
