import AppLogo from '@/components/app-logo';
import { supabase } from '@/constants/supabase';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

LocaleConfig.locales['en'] = {
  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
  ],
  monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: "Today"
};
LocaleConfig.defaultLocale = 'en';

type SubtaskItem = {
  id: string;
  title: string;
  is_completed: boolean;
};

type CategoryOption = {
  name: string;
  emoji?: string;
  color: string;
  date?: string;
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
  { name: 'work', emoji: 'briefcase', color: '#3B82F6' },
  { name: 'sport', emoji: 'dumbbell', color: '#22C55E' },
  { name: 'friends', emoji: 'users', color: '#F97316' },
];

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
        emoji: parsed.emoji?.trim(),
        color: parsed.color,
        date: parsed.date,
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

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

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
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORIES[0]);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_COLORS[0]);

  const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);

  const router = useRouter();

  const fetchTasks = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace('/login');
      return;
    }

    const { data, error } = await supabase.from('todos').select('*').order('id', { ascending: true });

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

    const categoryMap = new Map<string, CategoryOption>();
    [...DEFAULT_CATEGORIES, ...dynamicCategories].forEach((item) => {
      categoryMap.set(item.name, item);
    });

    const mergedCategories = Array.from(categoryMap.values());
    setCategories(mergedCategories);

    setSelectedCategory((prev) => {
      const exists = mergedCategories.find((item) => item.name === prev.name);
      return exists || mergedCategories[0];
    });
  }, [router]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const resetTaskModalFields = () => {
    setNewTask('');
    setNewDescription('');
    setNewSubtasks([createSubtask()]);
    setEditingTaskId(null);
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

    const payload = {
      task: newTask.trim(),
      description: newDescription.trim() || null,
      subtask: serializeSubtasks(newSubtasks),
      category: JSON.stringify({ ...selectedCategory, date: selectedDate }),
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

  const addCategory = () => {
    const normalizedName = newCategoryName.trim().toLowerCase();
    if (!normalizedName) return;

    const existing = categories.find((item) => item.name === normalizedName);
    if (existing) {
      setSelectedCategory(existing);
      setNewCategoryName('');
      setNewCategoryEmoji('');
      setNewCategoryColor(DEFAULT_COLORS[0]);
      setIsCategoryModalVisible(false);
      return;
    }

    const createdCategory: CategoryOption = {
      name: normalizedName,
      emoji: newCategoryEmoji.trim() || undefined,
      color: newCategoryColor,
    };

    const updated = [...categories, createdCategory];
    setCategories(updated);
    setSelectedCategory(createdCategory);

    setNewCategoryName('');
    setNewCategoryEmoji('');
    setNewCategoryColor(DEFAULT_COLORS[0]);
    setIsCategoryModalVisible(false);
  };

  const toggleTask = async (id: number | string, is_completed: boolean) => {
    const { error } = await supabase.from('todos').update({ is_completed: !is_completed }).eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    fetchTasks();
  };

  const toggleSubtask = async (task: Task, subtaskId: string) => {
    const updated = task.subtasks.map((item) =>
      item.id === subtaskId ? { ...item, is_completed: !item.is_completed } : item
    );

    const { error } = await supabase
      .from('todos')
      .update({ subtask: serializeSubtasks(updated) })
      .eq('id', task.id);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    fetchTasks();
  };

  const deleteTask = async (id: number | string) => {
    const { error } = await supabase.from('todos').delete().eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    fetchTasks();
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

  const todayString = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const activeCategoryStats = useMemo(() => {
    const map = new Map<string, { category: CategoryOption; count: number }>();
    const dateFilteredTasks = tasks.filter((task) => {
      const taskDate = task.categoryMeta?.date;
      if (!taskDate) return selectedDate === todayString;
      return taskDate === selectedDate;
    });
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
  }, [selectedDate, tasks, todayString]);

  useEffect(() => {
    if (selectedTaskFilter === 'all') return;
    const hasCategory = activeCategoryStats.some(({ category }) => category.name === selectedTaskFilter);
    if (!hasCategory) {
      setSelectedTaskFilter('all');
    }
  }, [activeCategoryStats, selectedTaskFilter]);

  const dateScopedTasks = useMemo(() => {
    return tasks.filter((task) => {
      const taskDate = task.categoryMeta?.date;
      if (!taskDate) {
        // Backward compatibility: old tasks without a date belong to today only.
        return selectedDate === todayString;
      }
      return taskDate === selectedDate;
    });
  }, [selectedDate, tasks, todayString]);

  const filteredTasks = useMemo(() => {
    let scopedTasks = dateScopedTasks;
    
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
  }, [dateScopedTasks, selectedTaskFilter]);

  const renderItem = ({ item }: { item: Task }) => {
    const expanded = Boolean(expandedTaskIds[String(item.id)]);

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

      <TouchableOpacity onPress={() => deleteTask(item.id)}>
        <Feather name="x" size={20} color="#999" />
      </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.taskExpandedArea}>
          {!!item.categoryMeta && (
            <View style={styles.categoryBadge}>
              <View style={[styles.categoryColorDot, { backgroundColor: item.categoryMeta.color }]} />
              <Text style={styles.categoryBadgeText}>
                {item.categoryMeta.emoji ? `${item.categoryMeta.emoji} ` : ''}
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

  const taskDateSet = useMemo(() => {
    const dates = new Set<string>();

    tasks.forEach((task) => {
      const taskDate = task.categoryMeta?.date;
      if (taskDate) {
        dates.add(taskDate);
      } else {
        // Keep legacy undated tasks on today.
        dates.add(todayString);
      }
    });

    return dates;
  }, [tasks, todayString]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AppLogo size={40} />
      </View>

      <View style={{ marginBottom: 16 }}>
        <Calendar
          current={selectedDate}
          onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
          dayComponent={({ date, state }: { date?: { day: number; dateString: string }; state?: string }) => {
            if (!date) return <View style={styles.dayPressArea} />;

            const isToday = date.dateString === todayString;
            const isSelected = date.dateString === selectedDate;
            const hasTask = taskDateSet.has(date.dateString);

            return (
              <TouchableOpacity
                style={styles.dayPressArea}
                onPress={() => setSelectedDate(date.dateString)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.dayNumberWrap,
                    isToday && styles.todaySquare,
                    isSelected && styles.selectedDayWrap,
                    isToday && isSelected && styles.selectedTodaySquare,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumberText,
                      state === 'disabled' && styles.dayDisabledText,
                      isSelected && styles.daySelectedText,
                    ]}
                  >
                    {date.day}
                  </Text>
                </View>
                {hasTask ? (
                  <View style={[styles.calendarTaskDot, isSelected && styles.calendarTaskDotSelected]} />
                ) : (
                  <View style={styles.calendarTaskDotSpacer} />
                )}
              </TouchableOpacity>
            );
          }}
          theme={{
            backgroundColor: '#ffffff',
            calendarBackground: '#ffffff',
            textSectionTitleColor: '#b6c1cd',
            dayTextColor: '#2d4150',
            textDisabledColor: '#d9e1e8',
            arrowColor: 'black',
            monthTextColor: 'black',
            indicatorColor: 'black',
            textDayFontWeight: '300',
            textMonthFontWeight: 'bold',
            textDayHeaderFontWeight: '300',
            textDayFontSize: 16,
            textMonthFontSize: 20,
            textDayHeaderFontSize: 14
          }}
          style={{
            borderRadius: 12,
            paddingBottom: 8,
          }}
          hideExtraDays={true}
          firstDay={1}
        />
      </View>

      <View style={styles.card}>
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
            <Text style={styles.activeCategoryText}>All ({dateScopedTasks.length})</Text>
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
                {category.emoji ? `${category.emoji} ` : ''}
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
          ListEmptyComponent={<Text style={styles.emptyText}>No tasks for this date</Text>}
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
                  return (
                    <TouchableOpacity
                      key={category.name}
                      style={[
                        styles.categoryOption,
                        isSelected && styles.categoryOptionSelected,
                      ]}
                      onPress={() => setSelectedCategory(category)}
                    >
                      <View style={[styles.categoryColorDot, { backgroundColor: category.color }]} />
                      <Text style={styles.categoryOptionText}>
                        {category.emoji ? `${category.emoji} ` : ''}
                        {category.name}
                      </Text>
                    </TouchableOpacity>
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
            <TextInput
              style={styles.input}
              placeholder="Emoji"
              value={newCategoryEmoji}
              onChangeText={setNewCategoryEmoji}
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
        <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(tabs)/home')}>
          <Feather name="home" size={24} color="black" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(tabs)/calendar')}>
          <Feather name="calendar" size={24} color="black" />
          <View style={styles.activeTabDot} />
        </TouchableOpacity>
        <View style={styles.navPlusContainer}>
          <AntDesign name="plus" size={24} color="black" />
        </View>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="clipboard" size={24} color="black" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="user" size={24} color="black" />
        </TouchableOpacity>
      </View>
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
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
  dayPressArea: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    marginVertical: 2,
  },
  dayNumberWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todaySquare: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#111',
  },
  selectedDayWrap: {
    backgroundColor: '#111',
  },
  selectedTodaySquare: {
    borderRadius: 8,
  },
  dayNumberText: {
    fontSize: 14,
    color: '#2d4150',
  },
  daySelectedText: {
    color: '#fff',
    fontWeight: '600',
  },
  dayDisabledText: {
    color: '#d9e1e8',
  },
  calendarTaskDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#111',
    marginTop: 3,
  },
  calendarTaskDotSelected: {
    backgroundColor: '#fff',
  },
  calendarTaskDotSpacer: {
    width: 5,
    height: 5,
    marginTop: 3,
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
