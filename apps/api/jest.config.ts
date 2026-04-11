import type { Config } from "jest";

const config: Config = {
  rootDir: ".",
  moduleFileExtensions: ["js", "json", "ts"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.spec.json" }],
  },
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts"],
  coverageDirectory: "coverage",
  moduleNameMapper: {
    "^@gestion/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
};

export default config;
