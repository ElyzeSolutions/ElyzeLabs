import { startGateway } from './server.js';

function parseArgs(argv: string[]): { configPath?: string } {
  const output: { configPath?: string } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--config' || token === '-c') && argv[index + 1]) {
      output.configPath = argv[index + 1];
      index += 1;
    }
  }

  return output;
}

const args = parseArgs(process.argv.slice(2));

startGateway(args.configPath)
  .then((app) => {
    const address = app.server.address();
    if (typeof address === 'string') {
      console.log(`Gateway listening on ${address}`);
    } else if (address) {
      console.log(`Gateway listening on http://${address.address}:${address.port}`);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
