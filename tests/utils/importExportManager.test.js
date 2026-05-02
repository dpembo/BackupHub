const importExportManager = require('../../utils/importExportManager.js');

describe('Import/Export Manager - Orchestration Flows', () => {
  describe('createOrchestrationExportBuffer()/parseOrchestrationImportBuffer()', () => {
    it('round-trips orchestration export/import payload', async () => {
      const source = {
        jobId: 'nightly-backup',
        orchestration: {
          id: 'orch-internal-id',
          name: 'Nightly Backup',
          description: 'Runs nightly backup tasks',
          icon: 'schema',
          color: '#2196F3',
          type: 'orchestration',
          nodes: [{ id: 'n1', type: 'start' }, { id: 'n2', type: 'script' }],
          edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
        },
      };

      const zipBuffer = await importExportManager.createOrchestrationExportBuffer(source);
      const parsed = await importExportManager.parseOrchestrationImportBuffer(zipBuffer);

      expect(Buffer.isBuffer(zipBuffer)).toBe(true);
      expect(parsed).toHaveProperty('manifest');
      expect(parsed).toHaveProperty('orchestration');
      expect(parsed.manifest.entityType).toBe('orchestration');
      expect(parsed.orchestration.jobId).toBe('nightly-backup');
      expect(parsed.orchestration.name).toBe('Nightly Backup');
      expect(parsed.orchestration.description).toBe('Runs nightly backup tasks');
      expect(parsed.orchestration.icon).toBe('schema');
      expect(parsed.orchestration.color).toBe('#2196F3');
      expect(parsed.orchestration.nodes).toEqual(source.orchestration.nodes);
      expect(parsed.orchestration.edges).toEqual(source.orchestration.edges);
    });

    it('rejects parsing non-orchestration package as orchestration', async () => {
      const scriptBuffer = await importExportManager.createScriptExportBuffer({
        scriptName: 'backup.sh',
        scriptContent: '#start-params\n#end-params\necho backup',
      });

      await expect(
        importExportManager.parseOrchestrationImportBuffer(scriptBuffer)
      ).rejects.toThrow('Import package entity type mismatch');
    });

    it('throws on invalid orchestration export payload', async () => {
      await expect(
        importExportManager.createOrchestrationExportBuffer({
          jobId: 'bad-orchestration',
          orchestration: {
            name: 'Broken',
            nodes: null,
            edges: [],
          },
        })
      ).rejects.toThrow('Invalid orchestration payload: nodes must be an array');
    });
  });

  describe('resolveUniqueOrchestrationIdentity()', () => {
    it('keeps identity when name and id are unique', () => {
      const existingJobs = {
        existing_one: { name: 'Existing One' },
      };

      const identity = importExportManager.resolveUniqueOrchestrationIdentity({
        desiredName: 'Fresh Import',
        desiredJobId: 'fresh-import',
        existingJobs,
      });

      expect(identity.renamed).toBe(false);
      expect(identity.name).toBe('Fresh Import');
      expect(identity.jobId).toBe('fresh-import');
    });

    it('auto-renames when desired identity already exists', () => {
      const existingJobs = {
        'nightly-backup': { name: 'Nightly Backup' },
        'nightly-backup-imported-1': { name: 'Nightly Backup (imported 1)' },
      };

      const identity = importExportManager.resolveUniqueOrchestrationIdentity({
        desiredName: 'Nightly Backup',
        desiredJobId: 'nightly-backup',
        existingJobs,
      });

      expect(identity.renamed).toBe(true);
      expect(identity.name).toBe('Nightly Backup (imported 2)');
      expect(identity.jobId).toBe('nightly-backup-imported-2');
    });
  });
});
