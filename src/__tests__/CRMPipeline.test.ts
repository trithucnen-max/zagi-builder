import DatabaseService from '../services/database/DatabaseService';

// Mock target dependencies
jest.mock('../utils/Logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

describe('CRM Pipeline Database & Actions', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    dbService = DatabaseService.getInstance();
    // Stub initialized to true
    (dbService as any).initialized = true;

    // Spy on database methods
    jest.spyOn(dbService, 'query').mockImplementation(() => []);
    jest.spyOn(dbService, 'run').mockImplementation(() => ({ changes: 1, lastInsertRowId: 1 }));
    jest.spyOn(dbService, 'runInsert').mockImplementation(() => 1);
    jest.spyOn(dbService, 'transaction').mockImplementation((fn: any) => fn());
    jest.spyOn(dbService, 'save').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should query pipeline stages ordered by position', () => {
    const mockStages = [
      { id: 1, name: 'Mới', color: '#3B82F6', position: 0 },
      { id: 2, name: 'Liên hệ', color: '#10B981', position: 1 },
    ];
    (dbService.query as jest.Mock).mockReturnValue(mockStages);

    const result = dbService.getPipelineStages();
    expect(dbService.query).toHaveBeenCalledWith(
      'SELECT * FROM crm_pipeline_stages ORDER BY position ASC'
    );
    expect(result).toEqual(mockStages);
  });

  it('should insert a new pipeline stage when id is missing', () => {
    const newStage = { name: 'Tiềm năng', color: '#F59E0B', position: 2 };
    (dbService.runInsert as jest.Mock).mockReturnValue(123);

    const id = dbService.savePipelineStage(newStage);
    expect(dbService.runInsert).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_pipeline_stages'),
      expect.arrayContaining(['Tiềm năng', '#F59E0B', 2])
    );
    expect(dbService.save).toHaveBeenCalled();
    expect(id).toBe(123);
  });

  it('should update an existing pipeline stage when id is provided', () => {
    const existingStage = { id: 12, name: 'Chốt', color: '#10B981', position: 3 };

    const id = dbService.savePipelineStage(existingStage);
    expect(dbService.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE crm_pipeline_stages SET name = ?'),
      [existingStage.name, existingStage.color, existingStage.position, existingStage.id]
    );
    expect(dbService.save).toHaveBeenCalled();
    expect(id).toBe(12);
  });

  it('should delete pipeline stage and set pipeline_stage_id to null for contacts', () => {
    dbService.deletePipelineStage(45);

    expect(dbService.transaction).toHaveBeenCalled();
    expect(dbService.run).toHaveBeenNthCalledWith(1,
      'DELETE FROM crm_pipeline_stages WHERE id = ?',
      [45]
    );
    expect(dbService.run).toHaveBeenNthCalledWith(2,
      'UPDATE contacts SET pipeline_stage_id = NULL WHERE pipeline_stage_id = ?',
      [45]
    );
    expect(dbService.save).toHaveBeenCalled();
  });

  it('should update contact pipeline stage', () => {
    dbService.updateContactPipelineStage('zalo_123', 'contact_456', 2);

    expect(dbService.run).toHaveBeenCalledWith(
      'UPDATE contacts SET pipeline_stage_id = ? WHERE owner_zalo_id = ? AND contact_id = ?',
      [2, 'zalo_123', 'contact_456']
    );
    expect(dbService.save).toHaveBeenCalled();
  });

  it('should update contact AI insights', () => {
    dbService.updateContactAiInsights('zalo_123', 'contact_456', 'positive', 'question');

    expect(dbService.run).toHaveBeenCalledWith(
      'UPDATE contacts SET ai_sentiment = ?, ai_intent = ? WHERE owner_zalo_id = ? AND contact_id = ?',
      ['positive', 'question', 'zalo_123', 'contact_456']
    );
    expect(dbService.save).toHaveBeenCalled();
  });
});
