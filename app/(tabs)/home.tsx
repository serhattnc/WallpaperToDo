import AppLogo from '@/components/app-logo';
import FlameStreakBadge from '@/components/flame-streak-badge';
import SideSlider from '@/components/side-slider';
import {
    loadCustomCategories,
    mergeCategories,
    saveCustomCategories,
    type StoredCategoryOption,
} from '@/constants/category-storage';
import { supabase } from '@/constants/supabase';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    FlatList,
    InteractionManager,
    Modal,
    PanResponder,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

type SubtaskItem = {
  id: string;
  title: string;
  is_completed: boolean;
};

type RecurrenceOption = 'today' | 'daily' | 'weekend' | 'weekday';

type CategoryOption = {
  name: string;
  color: string;
  date?: string;
  dueDateTime?: string | null;
  reminderBeforeMinutes?: number | null;
  recurrence?: RecurrenceOption;
  skipDates?: string[];
};

type Task = {
  id: number | string;
  task: string;
  description?: string | null;
  subtask?: string | null;
  category?: string | null;
  is_completed: boolean;
  subtasks: SubtaskItem[];
  categoryMeta: CategoryOption | null;
};

const DEFAULT_COLORS = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#14B8A6',
  '#3B82F6',
  '#6366F1',
  '#A855F7',
  '#EC4899',
  '#6B7280',
];

const DEFAULT_CATEGORIES: CategoryOption[] = [
  { name: 'none', color: '#6B7280' },
  { name: 'work', color: '#3B82F6' },
  { name: 'sport', color: '#22C55E' },
  { name: 'friends', color: '#F97316' },
];

const NONE_CATEGORY: CategoryOption = { name: 'none', color: '#6B7280' };
const NON_DELETABLE_CATEGORY_NAMES = new Set([NONE_CATEGORY.name]);
const REMINDER_OPTIONS = [
  { label: '5dk', minutes: 5 },
  { label: '10dk', minutes: 10 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
  { label: '6h', minutes: 360 },
  { label: '12h', minutes: 720 },
  { label: '1d', minutes: 1440 },
  { label: '2d', minutes: 2880 },
];

const RECURRENCE_OPTIONS: { label: string; value: RecurrenceOption }[] = [
  { label: 'Sadece Bugun', value: 'today' },
  { label: 'Her Gun', value: 'daily' },
  { label: 'Hafta Sonu', value: 'weekend' },
  { label: 'Hafta Ici', value: 'weekday' },
];

const normalizeRecurrence = (value?: string | null): RecurrenceOption => {
  if (value === 'daily' || value === 'weekend' || value === 'weekday' || value === 'today') {
    return value;
  }
  return 'today';
};

const createSubtask = (): SubtaskItem => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  is_completed: false,
});

const parseCategory = (value?: string | null): CategoryOption | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as CategoryOption;
    if (parsed && parsed.name && parsed.color) {
      return {
        name: parsed.name.trim().toLowerCase(),
        color: parsed.color,
        date: parsed.date,
        dueDateTime: parsed.dueDateTime ?? null,
        reminderBeforeMinutes:
          typeof parsed.reminderBeforeMinutes === 'number' ? parsed.reminderBeforeMinutes : null,
        recurrence: normalizeRecurrence(parsed.recurrence),
        skipDates: Array.isArray(parsed.skipDates)
          ? parsed.skipDates.filter((item): item is string => typeof item === 'string')
          : [],
      };
    }
  } catch {
    return {
      name: value.trim().toLowerCase(),
      color: '#6B7280',
    };
  }

  return null;
};

const parseSubtasks = (value?: string | null): SubtaskItem[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as { title?: string; is_completed?: boolean }[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: (item.title || '').trim(),
        is_completed: Boolean(item.is_completed),
      }))
      .filter((item) => item.title.length > 0);
  } catch {
    return [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: value,
        is_completed: false,
      },
    ];
  }
};

const serializeSubtasks = (items: SubtaskItem[]) => {
  const normalized = items
    .map((item) => ({ title: item.title.trim(), is_completed: item.is_completed }))
    .filter((item) => item.title.length > 0);

  return normalized.length ? JSON.stringify(normalized) : null;
};

const formatDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const parseTimeFromDueDateTime = (value?: string | null) => {
  if (!value) {
    return { hour: '09', minute: '00' };
  }

  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) {
    return { hour: '09', minute: '00' };
  }

  return { hour: match[1], minute: match[2] };
};

const formatTimeFromDueDateTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = parseTimeFromDueDateTime(value);
  return `${parsed.hour}:${parsed.minute}`;
};

const formatSchedulePreview = (date: string, hour: string, minute: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const displayDate = dateObj.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });

  return `${displayDate}, ${hour}:${minute}`;
};

const isTaskVisibleOnDate = (task: Task, targetDate: string, todayDate: string) => {
  const categoryMeta = task.categoryMeta;
  const taskDate = categoryMeta?.date;
  if (!taskDate) {
    // Backward compatibility: old undated tasks are shown only today.
    return targetDate === todayDate;
  }

  if (targetDate < taskDate) return false;

  const skipDates = categoryMeta?.skipDates || [];
  if (skipDates.includes(targetDate)) return false;

  const recurrence = normalizeRecurrence(categoryMeta?.recurrence);
  if (recurrence === 'today') {
    return targetDate === taskDate;
  }

  if (recurrence === 'daily') {
    return true;
  }

  const dayOfWeek = new Date(`${targetDate}T00:00:00`).getDay();
  if (recurrence === 'weekend') {
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  return dayOfWeek >= 1 && dayOfWeek <= 5;
};

const offsetDateKey = (baseDateKey: string, offsetDays: number) => {
  const [year, month, day] = baseDateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  return formatDateKey(date);
};

export default function HomeScreen() {
  const taskListRef = useRef<FlatList<Task>>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [editingTaskId, setEditingTaskId] = useState<number | string | null>(null);
  const [selectedTaskFilter, setSelectedTaskFilter] = useState('all');
  const [newTask, setNewTask] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSubtasks, setNewSubtasks] = useState<SubtaskItem[]>([]);
  const [titleError, setTitleError] = useState('');
  const titleErrorAnim = useMemo(() => new Animated.Value(0), []);

  const [categories, setCategories] = useState<CategoryOption[]>(DEFAULT_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<CategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORIES[0]);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_COLORS[0]);

  const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [isScheduleModalVisible, setIsScheduleModalVisible] = useState(false);
  const [isSideMenuVisible, setIsSideMenuVisible] = useState(false);
  const [longPressedCategoryName, setLongPressedCategoryName] = useState<string | null>(null);
  const longPressScaleAnim = useMemo(() => new Animated.Value(1), []);
  const [selectedTaskDate, setSelectedTaskDate] = useState(() => formatDateKey(new Date()));
  const [selectedTaskHour, setSelectedTaskHour] = useState('09');
  const [selectedTaskMinute, setSelectedTaskMinute] = useState('00');
  const [isCustomScheduleEnabled, setIsCustomScheduleEnabled] = useState(false);
  const [isTaskTimeEnabled, setIsTaskTimeEnabled] = useState(false);
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(60);
  const [selectedRecurrence, setSelectedRecurrence] = useState<RecurrenceOption>('today');
  const [editingSkipDates, setEditingSkipDates] = useState<string[]>([]);
  const hourPanStepRef = useRef(0);
  const minutePanStepRef = useRef(0);
  const hourValueRef = useRef(Number(selectedTaskHour));
  const minuteValueRef = useRef(Number(selectedTaskMinute));

  const router = useRouter();

  const changeHourBy = useCallback((delta: number) => {
    setSelectedTaskHour((prev) => {
      const nextHour = ((Number(prev) + delta) % 24 + 24) % 24;
      hourValueRef.current = nextHour;
      return String(nextHour).padStart(2, '0');
    });
  }, []);

  const changeMinuteBy = useCallback((delta: number) => {
    setSelectedTaskMinute((prev) => {
      const nextMinute = ((Number(prev) + delta) % 60 + 60) % 60;
      minuteValueRef.current = nextMinute;
      return String(nextMinute).padStart(2, '0');
    });
  }, []);

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 14 && Math.abs(gestureState.dy) < 10,
        onPanResponderRelease: (_, gestureState) => {
          if (isTaskModalVisible || isCategoryModalVisible) return;
          if (gestureState.dx < -70 && Math.abs(gestureState.dy) < 40) {
            router.navigate('/(tabs)/calendar');
          }
        },
      }),
    [isCategoryModalVisible, isTaskModalVisible, router]
  );

  const hourPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          hourPanStepRef.current = 0;
        },
        onPanResponderMove: (_, gestureState) => {
          const nextStep = Math.round(-gestureState.dy / 22);
          const stepDelta = nextStep - hourPanStepRef.current;
          if (stepDelta === 0) return;

          const direction = stepDelta > 0 ? 1 : -1;
          hourPanStepRef.current += direction;
          changeHourBy(direction);
        },
      }),
    [changeHourBy]
  );

  const minutePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          minutePanStepRef.current = 0;
        },
        onPanResponderMove: (_, gestureState) => {
          const nextStep = Math.round(-gestureState.dy / 10);
          const stepDelta = nextStep - minutePanStepRef.current;
          if (stepDelta === 0) return;

          const direction = stepDelta > 0 ? 1 : -1;
          minutePanStepRef.current += direction;
          changeMinuteBy(direction);
        },
      }),
    [changeMinuteBy]
  );

  useEffect(() => {
    hourValueRef.current = Number(selectedTaskHour);
  }, [selectedTaskHour]);

  useEffect(() => {
    minuteValueRef.current = Number(selectedTaskMinute);
  }, [selectedTaskMinute]);

  useEffect(() => {
    let alive = true;

    const bootstrapCustomCategories = async () => {
      const stored = (await loadCustomCategories()) as CategoryOption[];
      const initialCategories = mergeCategories(
        [NONE_CATEGORY],
        stored.length > 0 ? stored : DEFAULT_CATEGORIES
      ) as CategoryOption[];
      if (!alive) return;

      const merged = mergeCategories(initialCategories as StoredCategoryOption[]);
      setCustomCategories(initialCategories);
      setCategories(merged as CategoryOption[]);
      setSelectedCategory((prev) => merged.find((item) => item.name === prev.name) || (merged[0] as CategoryOption));

      if (stored.length === 0) {
        await saveCustomCategories(initialCategories as StoredCategoryOption[]);
      }
    };

    bootstrapCustomCategories();

    return () => {
      alive = false;
    };
  }, []);

  const fetchTasks = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace('/login');
      return;
    }

    const { data, error } = await supabase
      .from('todos')
      .select('id, task, description, subtask, category, is_completed, user_id')
      .eq('user_id', session.user.id)
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching tasks:', error);
      return;
    }

    const fetchedTasks = (data || []).map((row) => {
      const categoryMeta = parseCategory(row.category);
      return {
        ...row,
        subtasks: parseSubtasks(row.subtask),
        categoryMeta,
      } as Task;
    });

    setTasks(fetchedTasks);

    const dynamicCategories = fetchedTasks
      .map((item) => item.categoryMeta)
      .filter((item): item is CategoryOption => Boolean(item));

    const mergedCategories = mergeCategories(
      [NONE_CATEGORY],
      customCategories as StoredCategoryOption[],
      dynamicCategories as StoredCategoryOption[]
    ) as CategoryOption[];

    setCategories(mergedCategories);

    setSelectedCategory((prev) => {
      const exists = mergedCategories.find((item) => item.name === prev.name);
      return exists || mergedCategories[0];
    });
  }, [customCategories, router]);

  useEffect(() => {
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      fetchTasks();
    });

    return () => {
      interactionHandle.cancel();
    };
  }, [fetchTasks]);

  const resetTaskModalFields = () => {
    const now = new Date();
    setNewTask('');
    setNewDescription('');
    setNewSubtasks([createSubtask()]);
    setEditingTaskId(null);
    setSelectedCategory((prev) => categories.find((item) => item.name === NONE_CATEGORY.name) || prev);
    setSelectedTaskDate(formatDateKey(now));
    setSelectedTaskHour(String(now.getHours()).padStart(2, '0'));
    setSelectedTaskMinute(String(now.getMinutes()).padStart(2, '0'));
    setIsCustomScheduleEnabled(false);
    setIsTaskTimeEnabled(false);
    setIsReminderEnabled(false);
    setReminderBeforeMinutes(60);
    setSelectedRecurrence('today');
    setEditingSkipDates([]);
    setTitleError('');
    titleErrorAnim.setValue(0);
  };

  const openCreateTaskModal = () => {
    resetTaskModalFields();
    setIsTaskModalVisible(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTaskId(task.id);
    setNewTask(task.task || '');
    setNewDescription(task.description || '');
    setNewSubtasks(task.subtasks.length ? task.subtasks : [createSubtask()]);

    if (task.categoryMeta) {
      const exists = categories.find((item) => item.name === task.categoryMeta?.name);
      if (!exists) {
        setCategories((prev) => [...prev, task.categoryMeta as CategoryOption]);
      }
      setSelectedCategory(task.categoryMeta);
      setSelectedTaskDate(task.categoryMeta.date || formatDateKey(new Date()));

      const parsedTime = parseTimeFromDueDateTime(task.categoryMeta.dueDateTime);
      setSelectedTaskHour(parsedTime.hour);
      setSelectedTaskMinute(parsedTime.minute);
      setIsTaskTimeEnabled(Boolean(task.categoryMeta.dueDateTime));
      setSelectedRecurrence(normalizeRecurrence(task.categoryMeta.recurrence));
      setEditingSkipDates(task.categoryMeta.skipDates || []);

      const todayKey = formatDateKey(new Date());
      const hasCustomSchedule =
        (Boolean(task.categoryMeta.date) && task.categoryMeta.date !== todayKey) ||
        Boolean(task.categoryMeta.dueDateTime) ||
        typeof task.categoryMeta.reminderBeforeMinutes === 'number';
      setIsCustomScheduleEnabled(hasCustomSchedule);

      const hasReminder = typeof task.categoryMeta.reminderBeforeMinutes === 'number';
      setIsReminderEnabled(hasReminder);
      if (hasReminder) {
        setReminderBeforeMinutes(task.categoryMeta.reminderBeforeMinutes as number);
      }
    } else {
      setIsCustomScheduleEnabled(false);
      setIsTaskTimeEnabled(false);
      setIsReminderEnabled(false);
      setSelectedRecurrence('today');
      setEditingSkipDates([]);
    }

    setIsTaskModalVisible(true);
  };

  const saveTask = async () => {
    if (!newTask.trim()) {
      setTitleError('Task title is required.');
      titleErrorAnim.setValue(0);
      Animated.sequence([
        Animated.timing(titleErrorAnim, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(titleErrorAnim, { toValue: 0, duration: 130, useNativeDriver: true }),
        Animated.timing(titleErrorAnim, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(titleErrorAnim, { toValue: 0, duration: 130, useNativeDriver: true }),
      ]).start();
      return;
    }

    setTitleError('');

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const defaultDate = formatDateKey(new Date());
    const taskDate = isCustomScheduleEnabled ? selectedTaskDate : defaultDate;

    const payload = {
      task: newTask.trim(),
      description: newDescription.trim() || null,
      subtask: serializeSubtasks(newSubtasks),
      category: JSON.stringify({
        name: selectedCategory.name,
        color: selectedCategory.color,
        date: taskDate,
        dueDateTime:
          isCustomScheduleEnabled && isTaskTimeEnabled
            ? `${taskDate}T${selectedTaskHour}:${selectedTaskMinute}`
            : null,
        reminderBeforeMinutes:
          isCustomScheduleEnabled && isTaskTimeEnabled && isReminderEnabled ? reminderBeforeMinutes : null,
        recurrence: selectedRecurrence,
        skipDates: editingSkipDates,
      }),
      user_id: user.id,
    };

    const query = editingTaskId
      ? supabase.from('todos').update(payload).eq('id', editingTaskId)
      : supabase.from('todos').insert([payload]);

    const { error } = await query;

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    resetTaskModalFields();
    setIsTaskModalVisible(false);
    fetchTasks();
  };

  const addCategory = async () => {
    const normalizedName = newCategoryName.trim().toLowerCase();
    if (!normalizedName) return;

    const existing = categories.find((item) => item.name === normalizedName);
    if (existing) {
      setSelectedCategory(existing);
      setNewCategoryName('');
      setNewCategoryColor(DEFAULT_COLORS[0]);
      setIsCategoryModalVisible(false);
      return;
    }

    const createdCategory: CategoryOption = {
      name: normalizedName,
      color: newCategoryColor,
    };

    const updatedCustom = mergeCategories(
      customCategories as StoredCategoryOption[],
      [createdCategory] as StoredCategoryOption[]
    ) as CategoryOption[];

    setCustomCategories(updatedCustom);
    await saveCustomCategories(updatedCustom as StoredCategoryOption[]);
    setCategories((prev) => mergeCategories(prev as StoredCategoryOption[], [createdCategory] as StoredCategoryOption[]) as CategoryOption[]);
    setSelectedCategory(createdCategory);

    setNewCategoryName('');
    setNewCategoryColor(DEFAULT_COLORS[0]);
    setIsCategoryModalVisible(false);
  };

  const animateCategoryGrow = (categoryName: string) => {
    setLongPressedCategoryName(categoryName);
    longPressScaleAnim.setValue(1);
    Animated.spring(longPressScaleAnim, {
      toValue: 1.08,
      friction: 5,
      tension: 170,
      useNativeDriver: true,
    }).start();
  };

  const animateCategoryReset = () => {
    Animated.spring(longPressScaleAnim, {
      toValue: 1,
      friction: 6,
      tension: 170,
      useNativeDriver: true,
    }).start(() => {
      setLongPressedCategoryName(null);
    });
  };

  const deleteCategory = async (categoryToDelete: CategoryOption) => {
    if (NON_DELETABLE_CATEGORY_NAMES.has(categoryToDelete.name)) {
      Alert.alert('Info', 'This category cannot be deleted.');
      return;
    }

    if (categories.length <= 1) {
      Alert.alert('Info', 'At least one category should remain.');
      return;
    }

    const impactedTasks = tasks.filter((task) => task.categoryMeta?.name === categoryToDelete.name);
    if (impactedTasks.length > 0) {
      setTasks((prev) =>
        prev.map((task) =>
          task.categoryMeta?.name === categoryToDelete.name
            ? { ...task, category: null, categoryMeta: null }
            : task
        )
      );

      const results = await Promise.all(
        impactedTasks.map((task) => supabase.from('todos').update({ category: null }).eq('id', task.id))
      );

      if (results.some((result) => result.error)) {
        Alert.alert('Error', 'Category could not be removed from some tasks.');
        fetchTasks();
        return;
      }
    }

    const updatedCustom = customCategories.filter((item) => item.name !== categoryToDelete.name);
    const dynamicCategories = tasks
      .map((item) => item.categoryMeta)
      .filter((item): item is CategoryOption => item !== null)
      .filter((item) => item.name !== categoryToDelete.name);

    const merged = mergeCategories(
      [NONE_CATEGORY],
      updatedCustom as StoredCategoryOption[],
      dynamicCategories as StoredCategoryOption[]
    ) as CategoryOption[];

    setCustomCategories(updatedCustom);
    await saveCustomCategories(updatedCustom as StoredCategoryOption[]);
    setCategories(merged);

    setSelectedCategory((prev) => {
      if (prev.name === categoryToDelete.name) {
        return merged[0] || prev;
      }
      return prev;
    });

    if (selectedTaskFilter === categoryToDelete.name) {
      setSelectedTaskFilter('all');
    }
  };

  const confirmDeleteCategory = (category: CategoryOption) => {
    animateCategoryGrow(category.name);
    Alert.alert(
      'Delete category',
      `Delete "${category.name}" category?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: animateCategoryReset,
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCategory(category);
            animateCategoryReset();
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: animateCategoryReset,
      }
    );
  };

  const toggleTask = async (id: number | string, is_completed: boolean) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, is_completed: !is_completed } : task)));

    const { error } = await supabase.from('todos').update({ is_completed: !is_completed }).eq('id', id);

    if (error) {
      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, is_completed } : task)));
      Alert.alert('Error', error.message);
      return;
    }
  };

  const toggleSubtask = async (task: Task, subtaskId: string) => {
    const updated = task.subtasks.map((item) =>
      item.id === subtaskId ? { ...item, is_completed: !item.is_completed } : item
    );

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id ? { ...item, subtasks: updated, subtask: serializeSubtasks(updated) } : item
      )
    );

    const { error } = await supabase
      .from('todos')
      .update({ subtask: serializeSubtasks(updated) })
      .eq('id', task.id);

    if (error) {
      setTasks((prev) => prev.map((item) => (item.id === task.id ? task : item)));
      Alert.alert('Error', error.message);
      return;
    }
  };

  const skipRecurringTaskOnDate = async (task: Task, dateKey: string) => {
    if (!task.categoryMeta) return;

    const updatedMeta: CategoryOption = {
      ...task.categoryMeta,
      skipDates: Array.from(new Set([...(task.categoryMeta.skipDates || []), dateKey])),
    };

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? {
              ...item,
              categoryMeta: updatedMeta,
              category: JSON.stringify(updatedMeta),
            }
          : item
      )
    );

    const { error } = await supabase
      .from('todos')
      .update({ category: JSON.stringify(updatedMeta) })
      .eq('id', task.id);

    if (error) {
      Alert.alert('Error', error.message);
      fetchTasks();
    }
  };

  const deleteTask = async (id: number | string) => {
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((item) => item.id !== id));

    const { error } = await supabase.from('todos').delete().eq('id', id);

    if (error) {
      setTasks(previousTasks);
      Alert.alert('Error', error.message);
      return;
    }
  };

  const confirmDeleteTask = (task: Task) => {
    const todayKey = formatDateKey(new Date());
    const recurrence = normalizeRecurrence(task.categoryMeta?.recurrence);

    if (recurrence !== 'today' && isTaskVisibleOnDate(task, todayKey, todayKey)) {
      Alert.alert(
        'Tekrarlayan gorev',
        'Sadece bugunku gorev silinsin mi, yoksa tum tekrarlar mi silinsin?',
        [
          {
            text: 'Vazgec',
            style: 'cancel',
          },
          {
            text: 'Sadece Bugun',
            onPress: () => skipRecurringTaskOnDate(task, todayKey),
          },
          {
            text: 'Tumunu Sil',
            style: 'destructive',
            onPress: () => deleteTask(task.id),
          },
        ],
        { cancelable: true }
      );
      return;
    }

    Alert.alert(
      'Delete task',
      `"${task.task}" silinsin mi?`,
      [
        {
          text: 'Vazgec',
          style: 'cancel',
        },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => deleteTask(task.id),
        },
      ],
      { cancelable: true }
    );
  };

  const clearCustomSchedule = () => {
    const now = new Date();
    setIsCustomScheduleEnabled(false);
    setSelectedTaskDate(formatDateKey(now));
    setSelectedTaskHour(String(now.getHours()).padStart(2, '0'));
    setSelectedTaskMinute(String(now.getMinutes()).padStart(2, '0'));
    setIsTaskTimeEnabled(false);
    setIsReminderEnabled(false);
    setReminderBeforeMinutes(60);
  };

  const addSubtaskInput = () => {
    setNewSubtasks((prev) => [...prev, createSubtask()]);
  };

  const updateSubtaskInput = (id: string, value: string) => {
    setNewSubtasks((prev) => prev.map((item) => (item.id === id ? { ...item, title: value } : item)));
  };

  const toggleSubtaskInput = (id: string) => {
    setNewSubtasks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_completed: !item.is_completed } : item))
    );
  };

  const removeSubtaskInput = (id: string) => {
    setNewSubtasks((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleExpanded = (id: number | string) => {
    const key = String(id);
    setExpandedTaskIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeCategoryStats = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const dateFilteredTasks = tasks.filter((task) => isTaskVisibleOnDate(task, todayStr, todayStr));

    const map = new Map<string, { category: CategoryOption; count: number }>();
    dateFilteredTasks.forEach((task) => {
      if (!task.categoryMeta) return;
      const existing = map.get(task.categoryMeta.name);
      if (existing) {
        map.set(task.categoryMeta.name, { ...existing, count: existing.count + 1 });
      } else {
        map.set(task.categoryMeta.name, { category: task.categoryMeta, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [tasks]);

  const todayScopedTasks = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return tasks.filter((task) => isTaskVisibleOnDate(task, todayStr, todayStr));
  }, [tasks]);

  useEffect(() => {
    if (selectedTaskFilter === 'all') return;
    const hasCategory = activeCategoryStats.some(({ category }) => category.name === selectedTaskFilter);
    if (!hasCategory) {
      setSelectedTaskFilter('all');
    }
  }, [activeCategoryStats, selectedTaskFilter]);

  const filteredTasks = useMemo(() => {
    let scopedTasks = todayScopedTasks;

    if (selectedTaskFilter !== 'all') {
      scopedTasks = scopedTasks.filter((task) => task.categoryMeta?.name === selectedTaskFilter);
    }

    // Keep active tasks on top, completed at the bottom, and preserve insert order.
    return [...scopedTasks].sort((a, b) => {
      const completionDiff = Number(a.is_completed) - Number(b.is_completed);
      if (completionDiff !== 0) return completionDiff;

      if (typeof a.id === 'number' && typeof b.id === 'number') {
        return a.id - b.id;
      }

      return String(a.id).localeCompare(String(b.id));
    });
  }, [selectedTaskFilter, todayScopedTasks]);

  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  const streakDays = useMemo(() => {
    let streak = 0;

    for (let i = 0; i < 365; i += 1) {
      const targetDate = offsetDateKey(todayKey, -i);
      const dayTasks = tasks.filter((task) => isTaskVisibleOnDate(task, targetDate, todayKey));
      if (dayTasks.length === 0) break;

      const allDone = dayTasks.every((task) => task.is_completed);
      if (!allDone) break;

      streak += 1;
    }

    return streak;
  }, [tasks, todayKey]);

  const renderItem = ({ item }: { item: Task }) => {
    const expanded = Boolean(expandedTaskIds[String(item.id)]);
    const taskTime = formatTimeFromDueDateTime(item.categoryMeta?.dueDateTime);

    return (
    <View style={styles.taskItem}>
      <View style={styles.taskTopRow}>
        <TouchableOpacity onPress={() => toggleTask(item.id, item.is_completed)} style={styles.radioTapArea}>
        <View style={[styles.radio, item.is_completed && styles.radioSelected, styles.radioTop]}>
          {item.is_completed && <Feather name="check" size={14} color="white" />}
        </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.taskLeft}
          onPress={() => toggleExpanded(item.id)}
          onLongPress={() => openEditTaskModal(item)}
          delayLongPress={280}
          activeOpacity={0.85}
        >
        <View style={styles.taskContent}>
          <Text style={[styles.taskText, item.is_completed && styles.taskCompleted]}>{item.task}</Text>
          <Text
            style={[styles.taskDescription, item.is_completed && styles.taskCompleted]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.description || 'No description'}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => confirmDeleteTask(item)}>
        <Feather name="x" size={20} color="#999" />
      </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.taskExpandedArea}>
          {taskTime ? (
            <View style={styles.taskTimeBadge}>
              <Feather name="clock" size={12} color="#4B5563" />
              <Text style={[styles.taskTimeText, item.is_completed && styles.taskCompleted]}>{taskTime}</Text>
            </View>
          ) : null}

          {!!item.categoryMeta && item.categoryMeta.name !== NONE_CATEGORY.name && (
            <View style={styles.categoryBadge}>
              <View style={[styles.categoryColorDot, { backgroundColor: item.categoryMeta.color }]} />
              <Text style={styles.categoryBadgeText}>
                {item.categoryMeta.name}
              </Text>
            </View>
          )}

          {item.subtasks.length > 0 && (
            <View style={styles.subtaskList}>
              {item.subtasks.map((sub) => (
                <TouchableOpacity
                  key={sub.id}
                  style={styles.subtaskRow}
                  onPress={() => toggleSubtask(item, sub.id)}
                >
                  <View style={[styles.subtaskRadio, sub.is_completed && styles.radioSelected]}>
                    {sub.is_completed && <Feather name="check" size={12} color="white" />}
                  </View>
                  <Text style={[styles.taskSubtask, sub.is_completed && styles.taskCompleted]}>{sub.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
    );
  };

  const currentDate = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={styles.container} {...swipeResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerMenuButton} onPress={() => setIsSideMenuVisible(true)}>
          <Feather name="menu" size={22} color="#111827" />
        </TouchableOpacity>
        <AppLogo size={40} />
        <Text style={styles.dateText}>{currentDate}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Todays Tasks</Text>
          <View style={styles.streakInHeader}>
            <FlameStreakBadge days={streakDays} size={56} />
          </View>
        </View>

        <ScrollView
          horizontal
          style={{ maxHeight: 36, marginBottom: 12, flexShrink: 0 }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activeCategoryList}
          scrollEventThrottle={16}
        >
          <TouchableOpacity
            style={[
              styles.activeCategoryChip,
              selectedTaskFilter === 'all' && styles.activeCategoryChipSelected,
            ]}
            onPress={() => setSelectedTaskFilter('all')}
          >
            <View style={[styles.categoryColorDot, { backgroundColor: '#6B7280' }]} />
            <Text style={styles.activeCategoryText}>All ({todayScopedTasks.length})</Text>
          </TouchableOpacity>

          {activeCategoryStats.map(({ category, count }) => (
            <TouchableOpacity
              key={category.name}
              style={[
                styles.activeCategoryChip,
                selectedTaskFilter === category.name && styles.activeCategoryChipSelected,
              ]}
              onPress={() => setSelectedTaskFilter(category.name)}
            >
              <View style={[styles.categoryColorDot, { backgroundColor: category.color }]} />
              <Text style={styles.activeCategoryText}>
                {category.name} ({count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FlatList
          ref={taskListRef}
          data={filteredTasks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          style={styles.taskList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
          ListEmptyComponent={<Text style={styles.emptyText}>No tasks for today</Text>}
        />

        <TouchableOpacity style={styles.addButton} onPress={openCreateTaskModal}>
          <AntDesign name="plus" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <Modal visible={isTaskModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingTaskId ? 'Edit Task' : 'Add New Task'}</Text>

            <Animated.View
              style={[
                styles.titleInputWrap,
                {
                  borderColor: titleError ? '#DC2626' : '#ddd',
                  transform: [
                    {
                      translateX: titleErrorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 4],
                      }),
                    },
                  ],
                },
              ]}
            >
              <TextInput
                style={styles.titleInput}
                placeholder="Title"
                value={newTask}
                onChangeText={(value) => {
                  setNewTask(value);
                  if (titleError && value.trim()) {
                    setTitleError('');
                  }
                }}
                autoFocus
              />

            </Animated.View>
            {titleError ? <Text style={styles.titleErrorText}>{titleError}</Text> : null}

            <TextInput
              style={styles.input}
              placeholder="Description"
              value={newDescription}
              onChangeText={setNewDescription}
            />

            <View style={styles.subtaskHeaderRow}>
              <Text style={styles.categoryTitle}>Subtasks</Text>
              <TouchableOpacity style={styles.smallPlusButton} onPress={addSubtaskInput}>
                <AntDesign name="plus" size={14} color="black" />
              </TouchableOpacity>
            </View>

            {newSubtasks.length > 0 && (
              <View style={styles.subtaskInputList}>
                {newSubtasks.map((sub) => (
                  <View key={sub.id} style={styles.subtaskInputRow}>
                    <TouchableOpacity onPress={() => toggleSubtaskInput(sub.id)}>
                      <View style={[styles.subtaskRadio, sub.is_completed && styles.radioSelected]}>
                        {sub.is_completed && <Feather name="check" size={12} color="white" />}
                      </View>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.subtaskInput}
                      placeholder="Subtask"
                      value={sub.title}
                      onChangeText={(value) => updateSubtaskInput(sub.id, value)}
                    />
                    <TouchableOpacity onPress={() => removeSubtaskInput(sub.id)}>
                      <Feather name="x" size={16} color="#777" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.categoryTitle}>Category</Text>
            <View style={styles.categoryRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScrollContent}
              >
                {categories.map((category) => {
                  const isSelected = selectedCategory.name === category.name;
                  const isNonDeletable = NON_DELETABLE_CATEGORY_NAMES.has(category.name);
                  const isLongPressed = longPressedCategoryName === category.name;

                  return (
                    <Animated.View
                      key={category.name}
                      style={[
                        isLongPressed && {
                          transform: [{ scale: longPressScaleAnim }],
                        },
                      ]}
                    >
                      <TouchableOpacity
                        style={[
                          styles.categoryOption,
                          isSelected && styles.categoryOptionSelected,
                        ]}
                        onPress={() => setSelectedCategory(category)}
                        onLongPress={() => confirmDeleteCategory(category)}
                        delayLongPress={280}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.categoryColorDot, { backgroundColor: category.color }]} />
                        <Text style={styles.categoryOptionText}>
                          {category.name}
                        </Text>
                        {!isNonDeletable && <Feather name="trash-2" size={11} color="#6B7280" />}
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={styles.categoryAddOnlyButton}
                onPress={() => setIsCategoryModalVisible(true)}
              >
                <AntDesign name="plus" size={18} color="black" />
              </TouchableOpacity>
            </View>

            <View style={styles.scheduleRow}>
              <Text style={styles.categoryTitle}>Tarih</Text>
              <View style={styles.scheduleActionRow}>
                <TouchableOpacity
                  style={[
                    styles.scheduleHorizontalButton,
                    isCustomScheduleEnabled && styles.scheduleHorizontalButtonActive,
                  ]}
                  onPress={() => setIsScheduleModalVisible(true)}
                >
                  <Feather name="calendar" size={16} color={isCustomScheduleEnabled ? '#111827' : '#4B5563'} />
                  <Text style={styles.scheduleHorizontalButtonText}>
                    {isCustomScheduleEnabled
                      ? formatSchedulePreview(selectedTaskDate, selectedTaskHour, selectedTaskMinute)
                      : 'Ozel tarih ekle'}
                  </Text>
                </TouchableOpacity>
                {isCustomScheduleEnabled && (
                  <TouchableOpacity style={styles.clearScheduleButton} onPress={clearCustomSchedule}>
                    <Feather name="x" size={14} color="#6B7280" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.recurrenceRow}>
              <Text style={styles.categoryTitle}>Gorev Tekrari</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recurrenceOptionsRow}
              >
                {RECURRENCE_OPTIONS.map((option) => {
                  const selected = selectedRecurrence === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.recurrenceOption, selected && styles.recurrenceOptionSelected]}
                      onPress={() => setSelectedRecurrence(option.value)}
                    >
                      <Text
                        style={[
                          styles.recurrenceOptionText,
                          selected && styles.recurrenceOptionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => {
                  resetTaskModalFields();
                  setIsTaskModalVisible(false);
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonAdd} onPress={saveTask}>
                <Text style={[styles.modalButtonText, { color: 'white' }]}>{editingTaskId ? 'Save' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isScheduleModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.scheduleModalContent]}>
            <Text style={styles.modalTitle}>Tarih, Saat ve Hatirlatma</Text>

            <Calendar
              current={selectedTaskDate}
              onDayPress={(day: { dateString: string }) => setSelectedTaskDate(day.dateString)}
              markedDates={{
                [selectedTaskDate]: {
                  selected: true,
                  selectedColor: '#111',
                },
              }}
              theme={{
                backgroundColor: '#fff',
                calendarBackground: '#fff',
                textSectionTitleColor: '#9CA3AF',
                dayTextColor: '#111827',
                todayTextColor: '#111827',
                selectedDayTextColor: '#fff',
                arrowColor: '#111827',
                monthTextColor: '#111827',
                textMonthFontWeight: '700',
                textDayFontWeight: '400',
              }}
              style={styles.scheduleCalendar}
            />

            <View style={styles.timePickerWrap}>
              <TouchableOpacity
                style={[
                  styles.timeMainButton,
                  isTaskTimeEnabled && styles.timeMainButtonActive,
                ]}
                onPress={() => {
                  setIsTaskTimeEnabled((prev) => {
                    const next = !prev;
                    if (!next) {
                      setIsReminderEnabled(false);
                    }
                    return next;
                  });
                }}
              >
                <Feather name="clock" size={16} color={isTaskTimeEnabled ? '#111827' : '#6B7280'} />
                <Text style={styles.timeMainButtonText}>
                  {isTaskTimeEnabled ? `Saat Secildi (${selectedTaskHour}:${selectedTaskMinute})` : 'Saat Ekleme (Istege Bagli)'}
                </Text>
              </TouchableOpacity>

              {isTaskTimeEnabled && (
                <View style={styles.timeWheelRow}>
                  <View style={styles.timeWheelCard} {...hourPanResponder.panHandlers}>
                    <TouchableOpacity onPress={() => changeHourBy(1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="chevron-up" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <Text style={styles.timeWheelValue}>{selectedTaskHour}</Text>
                    <TouchableOpacity onPress={() => changeHourBy(-1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="chevron-down" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.timeBigSeparator}>:</Text>

                  <View style={styles.timeWheelCard} {...minutePanResponder.panHandlers}>
                    <TouchableOpacity onPress={() => changeMinuteBy(1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="chevron-up" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <Text style={styles.timeWheelValue}>{selectedTaskMinute}</Text>
                    <TouchableOpacity onPress={() => changeMinuteBy(-1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="chevron-down" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {isTaskTimeEnabled && (
              <TouchableOpacity
                style={[
                  styles.reminderMainButton,
                  isReminderEnabled && styles.reminderMainButtonActive,
                ]}
                onPress={() => setIsReminderEnabled((prev) => !prev)}
              >
                <Feather name="bell" size={16} color={isReminderEnabled ? '#111827' : '#6B7280'} />
                <Text style={styles.reminderMainButtonText}>
                  {isReminderEnabled ? 'Hatirlatma Acik' : 'Hatirlatma Kapali'}
                </Text>
              </TouchableOpacity>
            )}

            {isTaskTimeEnabled && isReminderEnabled && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.reminderOptionRow}
              >
                {REMINDER_OPTIONS.map((option) => {
                  const selected = reminderBeforeMinutes === option.minutes;
                  return (
                    <TouchableOpacity
                      key={option.minutes}
                      style={[
                        styles.reminderOption,
                        selected && styles.reminderOptionSelected,
                      ]}
                      onPress={() => setReminderBeforeMinutes(option.minutes)}
                    >
                      <Text
                        style={[
                          styles.reminderOptionText,
                          selected && styles.reminderOptionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setIsScheduleModalVisible(false)}>
                <Text style={styles.modalButtonText}>Kapat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonAdd}
                onPress={() => {
                  setIsCustomScheduleEnabled(true);
                  setIsScheduleModalVisible(false);
                }}
              >
                <Text style={[styles.modalButtonText, { color: 'white' }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isCategoryModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Category</Text>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              autoCapitalize="none"
            />
            <Text style={styles.categoryTitle}>Color</Text>
            <View style={styles.colorGrid}>
              {DEFAULT_COLORS.map((color) => {
                const selected = newCategoryColor === color;
                return (
                  <TouchableOpacity
                    key={color}
                    style={[styles.colorSwatch, { backgroundColor: color }, selected && styles.colorSwatchSelected]}
                    onPress={() => setNewCategoryColor(color)}
                  />
                );
              })}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setIsCategoryModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonAdd} onPress={addCategory}>
                <Text style={[styles.modalButtonText, { color: 'white' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.navigate('/(tabs)/home')}>
          <Feather name="home" size={24} color="black" />
          <View style={styles.activeTabDot} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.navigate('/(tabs)/calendar')}>
          <Feather name="calendar" size={24} color="black" />
        </TouchableOpacity>
        <View style={styles.navPlusContainer}>
          <AntDesign name="plus" size={24} color="black" />
        </View>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="clipboard" size={24} color="black" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.navigate('/(tabs)/friends')}>
          <Feather name="users" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <SideSlider
        visible={isSideMenuVisible}
        onClose={() => setIsSideMenuVisible(false)}
        currentRoute="home"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  headerMenuButton: {
    position: 'absolute',
    left: 0,
    top: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  dateText: {
    color: '#666',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    marginBottom: 20,
    position: 'relative',
  },
  cardHeader: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  streakInHeader: {
    marginTop: -4,
  },
  activeCategoryList: {
    paddingBottom: 4,
    gap: 8,
    paddingHorizontal: 16,
  },
  activeCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    height: 28,
    paddingHorizontal: 9,
    paddingVertical: 0,
    backgroundColor: '#ECEFF1',
    marginRight: 8,
  },
  activeCategoryChipSelected: {
    backgroundColor: '#DDE3E8',
    borderColor: '#8F959B',
  },
  activeCategoryText: {
    fontSize: 11,
    color: '#111',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: 40,
  },
  taskList: {
    flex: 1,
  },
  taskItem: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioTapArea: {
    marginRight: 10,
  },
  taskLeft: {
    flex: 1,
  },
  taskContent: {
    flex: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#666',
    marginRight: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtaskRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  radioTop: {
    marginTop: 2,
  },
  radioSelected: {
    backgroundColor: 'black',
    borderColor: 'black',
  },
  taskText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  taskDescription: {
    fontSize: 13,
    color: '#7C7C7C',
    marginTop: 4,
  },
  taskTimeText: {
    fontSize: 12,
    color: '#4B5563',
    marginLeft: 6,
    fontWeight: '600',
  },
  subtaskList: {
    marginTop: 8,
  },
  taskExpandedArea: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#D4D4D4',
    paddingTop: 8,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  taskSubtask: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskTimeBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryBadgeText: {
    fontSize: 11,
    color: '#111',
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  categoryColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  addButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#EAEAEA',
    padding: 16,
    borderRadius: 12,
    height: 100,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D0F0F8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '86%',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  titleInputWrap: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    position: 'relative',
  },
  titleInput: {
    paddingVertical: 12,
    fontSize: 15,
  },
  titleErrorText: {
    color: '#DC2626',
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 6,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtaskHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 2,
  },
  smallPlusButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#BBB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  subtaskInputList: {
    marginBottom: 12,
  },
  subtaskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  subtaskInput: {
    flex: 1,
    marginBottom: 0,
    marginRight: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderWidth: 0,
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  subtaskInputText: {
    flex: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryScrollContent: {
    gap: 8,
    paddingRight: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
  },
  categoryOptionSelected: {
    borderWidth: 1.5,
    borderColor: '#111',
    backgroundColor: '#F3F4F6',
  },
  categoryOptionText: {
    fontSize: 11,
    color: '#111',
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  categoryAddOnlyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  scheduleRow: {
    marginBottom: 12,
  },
  recurrenceRow: {
    marginBottom: 12,
  },
  recurrenceOptionsRow: {
    marginTop: 8,
    paddingBottom: 2,
    gap: 8,
  },
  recurrenceOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F3F4F6',
  },
  recurrenceOptionSelected: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  recurrenceOptionText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  recurrenceOptionTextSelected: {
    color: '#FFFFFF',
  },
  scheduleActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  scheduleHorizontalButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  scheduleHorizontalButtonActive: {
    borderColor: '#9CA3AF',
    backgroundColor: '#EEF2F7',
  },
  clearScheduleButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginLeft: 6,
  },
  scheduleHorizontalButtonText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  scheduleModalContent: {
    maxHeight: '88%',
  },
  scheduleCalendar: {
    borderRadius: 12,
    marginBottom: 12,
  },
  timePickerWrap: {
    marginBottom: 12,
  },
  timeMainButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeMainButtonActive: {
    borderColor: '#9CA3AF',
    backgroundColor: '#EEF2F7',
  },
  timeMainButtonText: {
    marginLeft: 8,
    color: '#111827',
    fontWeight: '600',
    fontSize: 13,
  },
  timeWheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  timeWheelCard: {
    width: 132,
    borderRadius: 14,
    borderWidth: 0,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  timeWheelValue: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 40,
  },
  timeBigSeparator: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  reminderMainButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reminderMainButtonActive: {
    borderColor: '#9CA3AF',
    backgroundColor: '#EEF2F7',
  },
  reminderMainButtonText: {
    marginLeft: 8,
    color: '#111827',
    fontWeight: '600',
    fontSize: 13,
  },
  reminderOptionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingRight: 8,
  },
  reminderOption: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  reminderOptionSelected: {
    borderColor: '#111827',
    backgroundColor: '#E5E7EB',
  },
  reminderOptionText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  reminderOptionTextSelected: {
    color: '#111827',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: '#111',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  modalButtonCancel: {
    padding: 12,
  },
  modalButtonAdd: {
    backgroundColor: 'black',
    padding: 12,
    borderRadius: 8,
    paddingHorizontal: 24,
  },
  modalButtonText: {
    fontWeight: '600',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
  },
  activeTabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'black',
    marginTop: 4,
  },
  navPlusContainer: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
