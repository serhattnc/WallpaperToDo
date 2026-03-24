import AsyncStorage from '@react-native-async-storage/async-storage';

export type StoredCategoryOption = {
  name: string;
  color: string;
  date?: string;
};

const CATEGORY_STORAGE_KEY = 'custom_categories_v1';

const normalizeCategory = (category: StoredCategoryOption): StoredCategoryOption | null => {
  const normalizedName = category.name?.trim().toLowerCase();
  const normalizedColor = category.color?.trim();

  if (!normalizedName || !normalizedColor) {
    return null;
  }

  return {
    name: normalizedName,
    color: normalizedColor,
    date: category.date,
  };
};

export const mergeCategories = (...groups: StoredCategoryOption[][]): StoredCategoryOption[] => {
  const map = new Map<string, StoredCategoryOption>();

  groups.flat().forEach((item) => {
    const normalized = normalizeCategory(item);
    if (!normalized) return;
    map.set(normalized.name, normalized);
  });

  return Array.from(map.values());
};

export const loadCustomCategories = async (): Promise<StoredCategoryOption[]> => {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredCategoryOption[];
    if (!Array.isArray(parsed)) return [];

    return mergeCategories(parsed);
  } catch {
    return [];
  }
};

export const saveCustomCategories = async (categories: StoredCategoryOption[]): Promise<void> => {
  const normalized = mergeCategories(categories);
  await AsyncStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(normalized));
};
