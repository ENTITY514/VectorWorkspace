// src/shared/api/circulumPlanParser.test.tsx

import { parseAcademicPlan } from './circulumPlanParser';
import { AcademicPlan, LearningObjective } from '../../entities/circulumPlan/model/types';

// Mock a File object
const createMockFile = (content: string, type: string, name: string): File => {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
};

// Mock XLSX since we are not in a real browser environment with file reading
// We will mock the sheet_to_json result directly
jest.mock('xlsx', () => ({
  read: jest.fn().mockReturnValue({
    SheetNames: ['Sheet1'],
    Sheets: {
      'Sheet1': {},
    },
  }),
  utils: {
    sheet_to_json: jest.fn(),
  },
}));

const XLSX = require('xlsx');

describe('circulumPlanParser for .xls format', () => {

  it('should parse multiple objectives from a single cell (separated by newlines)', async () => {
    // Arrange: Mock the data returned by sheet_to_json for an .xls file
    const mockSheetData = [
      ['1 четверть', '', ''],
      ['Раздел 1', 'Тема 1', '9.1.1.1 Цель первая\n9.1.1.2 Цель вторая\nЕще одна строка для второй цели\n9.1.1.3 Третья цель'],
    ];
    
    (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue(mockSheetData);

    // Act
    const file = createMockFile('dummy content', 'application/vnd.ms-excel', 'test.xls');
    const academicPlan: AcademicPlan = await parseAcademicPlan(file);

    // Assert
    expect(academicPlan).toBeDefined();
    expect(academicPlan.length).toBe(1); // 1 четверть
    expect(academicPlan[0].sections.length).toBe(1); // 1 раздел
    expect(academicPlan[0].sections[0].topics.length).toBe(1); // 1 тема

    const objectives: LearningObjective[] = academicPlan[0].sections[0].topics[0].objectives;
    expect(objectives.length).toBe(3); // <--- КЛЮЧЕВАЯ ПРОВЕРКА

    expect(objectives[0].id).toBe('9.1.1.1');
    expect(objectives[0].description).toBe('Цель первая');

    expect(objectives[1].id).toBe('9.1.1.2');
    expect(objectives[1].description).toBe('Цель вторая Еще одна строка для второй цели');

    expect(objectives[2].id).toBe('9.1.1.3');
    expect(objectives[2].description).toBe('Третья цель');
  });

  it('should handle topics with only one objective correctly', async () => {
    // Arrange
     const mockSheetData = [
      ['1 четверть', '', ''],
      ['Раздел 1', 'Тема 1', '9.1.1.1 Цель первая'],
      ['', 'Тема 2', '9.2.2.2 Цель вторая'],
    ];
    (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue(mockSheetData);

    // Act
    const file = createMockFile('dummy content', 'application/vnd.ms-excel', 'test.xls');
    const academicPlan: AcademicPlan = await parseAcademicPlan(file);

    // Assert
    const topic1Objectives = academicPlan[0].sections[0].topics[0].objectives;
    expect(topic1Objectives.length).toBe(1);
    expect(topic1Objectives[0].id).toBe('9.1.1.1');

    const topic2Objectives = academicPlan[0].sections[0].topics[1].objectives;
    expect(topic2Objectives.length).toBe(1);
    expect(topic2Objectives[0].id).toBe('9.2.2.2');
  });

});
