import { describe, expectTypeOf, it } from "vitest";
// Resolves to dist/index.d.mts: this checks the *emitted* declarations, not the sources.
import { choice, noul, score, type TypeSafeClient } from "../../dist/index.mjs";

declare const client: TypeSafeClient;

describe("emitted declarations", () => {
  it("preserve literal inference through the bundle", async () => {
    const { answers } = await client.systemOne({
      state: null,
      questions: {
        a: noul(null),
        b: choice(null, { yes: null, no: null }),
        c: score(null, [null, "high"]),
        d: { type: "noul" },
      },
    });
    expectTypeOf(answers.a.noul).toEqualTypeOf<number>();
    expectTypeOf(answers.b.choice).toEqualTypeOf<"yes" | "no">();
    expectTypeOf(answers.b.probabilities).toEqualTypeOf<{
      readonly yes: number;
      readonly no: number;
    }>();
    expectTypeOf(answers.c.legend).toEqualTypeOf<{ readonly 0: null; readonly 1: "high" }>();
    expectTypeOf(answers.d.noul).toEqualTypeOf<number>();
    // @ts-expect-error unknown label
    answers.b.probabilities.maybe;
  });
});
