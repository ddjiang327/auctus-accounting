import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export type CsvValue = string | number | boolean | null | undefined;

function csvCell(value: CsvValue) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: CsvValue[][]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export async function shareCsv(filename: string, content: string) {
  try {
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: `Share ${filename}` });
      return;
    }
    Alert.alert('Sharing unavailable', 'File sharing is not supported on this device.');
  } catch (error) {
    Alert.alert('Export failed', error instanceof Error ? error.message : 'Unknown error');
  }
}
