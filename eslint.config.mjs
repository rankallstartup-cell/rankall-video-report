import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.ts", "app/**/*.tsx", "lib/**/*.ts"],
    ignores: ["lib/usePlan.ts", "lib/resolvePlanServer.ts", "lib/planConfig.tsx"],
    rules: {
      "no-restricted-syntax": ["error",
        {
          selector: "MemberExpression[property.name='account_type']",
          message: "Don't read account_type directly. Use usePlan() (client) or resolvePlanServer() (server). See lib/resolvePlanServer.ts header.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
