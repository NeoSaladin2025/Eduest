export interface MinorUnit {
  id: string;
  major_unit_id: string;
  name: string;
  order_index: number;
}

export interface MajorUnit {
  id: string;
  textbook_id: string;
  name: string;
  order_index: number;
  minor_units: MinorUnit[];
}

export interface Textbook {
  id: string;
  name: string;
  grade: string;
  description?: string;
  color_theme?: string;
  major_units: MajorUnit[];
  created_at: string;
  updated_at: string;
}

export interface TextbookItem {
  id: string;
  textbook_id: string;
  major_unit_id: string;
  minor_unit_id: string;
  grade: string;
  drive_id: string;
  name: string;
  display_name?: string | null;
  folder_name?: string | null;
  folder_path?: string | null;
  folder_id?: string | null;
  question_number?: number | null;
  question_image_drive_id?: string | null;
  order_index: number;
  added_at: string;
}
