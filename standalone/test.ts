import { testProvider, providerInfos } from '../src/provider-test.js';

/**
 * Standalone provider key tester (mirrors the web panel /providers/test).
 * Usage:
 *   node dist/standalone/test.js --provider nvidia --key sk-xxx
 *   PROVIDER=nvidia PROVIDER_TEST_KEY=sk-xxx node dist/standalone/test.js
 *   node dist/standalone/test.js --list
 */
function usage(): never {
  console.error(
    'Usage: node dist/standalone/test.js --provider <name> --key <apiKey> | --list'
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log(JSON.stringify(providerInfos(), null, 2));
    return;
  }

  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const provider = flag('--provider') || process.env.PROVIDER;
  const key = flag('--key') || process.env.PROVIDER_TEST_KEY;
  if (!provider || !key) usage();

  const result = await testProvider(provider, key);
  console.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    console.log(`✓ ${result.message}`);
  } else {
    console.error(`✗ ${result.message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});