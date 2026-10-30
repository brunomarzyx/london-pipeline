import { chat } from "../lib/meta";

async function main(): Promise<void> {
  const { reply, usage } = await chat("reply with the word ok");
  console.log("reply:", reply);
  console.log("usage:", JSON.stringify(usage));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
