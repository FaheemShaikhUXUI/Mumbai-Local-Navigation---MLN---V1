import { CanonicalCompiler } from '@mumbai-timetable/data-sources';
import { CanonicalDataset } from '@mumbai-timetable/types';

export class TimetableParserService {
  /**
   * Compiles the complete verified official timetable dataset.
   */
  static parseSuburbanNetwork(version: string, effectiveDate?: string): CanonicalDataset {
    return CanonicalCompiler.compile(version, effectiveDate);
  }
}
