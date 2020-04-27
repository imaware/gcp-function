import {
  checkFilesExist,
  ensureNxProject,
  readJson,
  runNxCommandAsync,
  uniq
} from '@nrwl/nx-plugin/testing';
describe('gcp-function e2e', () => {
  it('should create gcp-function', async done => {
    const plugin = uniq('gcp-function');
    ensureNxProject('@joelcode/gcp-function', 'dist/libs/gcp-function');
    await runNxCommandAsync(
      `generate @joelcode/gcp-function:gcpFunction ${plugin}`
    );

    const result = await runNxCommandAsync(`build ${plugin}`);
    expect(result.stdout).toContain('Builder ran');

    done();
  });

  describe('--directory', () => {
    it('should create src in the specified directory', async done => {
      const plugin = uniq('gcp-function');
      ensureNxProject('@joelcode/gcp-function', 'dist/libs/gcp-function');
      await runNxCommandAsync(
        `generate @joelcode/gcp-function:gcpFunction ${plugin} --directory subdir`
      );
      expect(() =>
        checkFilesExist(`libs/subdir/${plugin}/src/index.ts`)
      ).not.toThrow();
      done();
    });
  });

  describe('--tags', () => {
    it('should add tags to nx.json', async done => {
      const plugin = uniq('gcp-function');
      ensureNxProject('@joelcode/gcp-function', 'dist/libs/gcp-function');
      await runNxCommandAsync(
        `generate @joelcode/gcp-function:gcpFunction ${plugin} --tags e2etag,e2ePackage`
      );
      const nxJson = readJson('nx.json');
      expect(nxJson.projects[plugin].tags).toEqual(['e2etag', 'e2ePackage']);
      done();
    });
  });
});
