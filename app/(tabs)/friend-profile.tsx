import AppLogo from '@/components/app-logo';
import FlameStreakBadge from '@/components/flame-streak-badge';
import {
  loadCustomCategories,
  mergeCategories,
  saveCustomCategories,
  type StoredCategoryOption,
} from '@/constants/category-storage';
import {
  addFriendTask,
  createFriendSubtask,
  FriendTaskItem,
  loadCanFriendSendTasks,
  loadFriendProfile,
  loadFriendStats,
  loadFriendTasks,
  parseFriendSchedule,
  parseFriendSubtasks,
  removeFriendTask,
  saveCanFriendSendTasks,
  serializeFriendSubtasks,
  type SubtaskItem,
  type TaskSchedule,
} from '@/constants/friend-task-storage';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  InteractionManager,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const DEFAULT_CATEGORIES: StoredCategoryOption[] = [
  { name: 'none', color: '#6B7280' },
  { name: 'work', color: '#3B82F6' },
  { name: 'sport', color: '#22C55E' },
  { name: 'friends', color: '#F97316' },
];

const RECURRENCE_OPTIONS: { label: string; value: TaskSchedule['recurrence'] }[] = [
  { label: 'Bugun', value: 'today' },
  { label: 'Gunluk', value: 'daily' },
  { label: 'Hafta ici', value: 'weekday' },
  { label: 'Hafta sonu', value: 'weekend' },
];

const resolveParam = (value?: string | string[]) => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const formatSchedulePreview = (date: string, hour: string, minute: string) => `${date} ${hour}:${minute}`;

const createSubtask = (): SubtaskItem => createFriendSubtask();

export default function FriendProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ friendId?: string | string[]; username?: string | string[]; avatarUrl?: string | string[] }>();
  const friendId = resolveParam(params.friendId);
  const initialName = resolveParam(params.username) || 'kullanici';
  const initialAvatarUrl = resolveParam(params.avatarUrl);

  const [loading, setLoading] = useState(true);
  const [friendName, setFriendName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl || null);
  const [friendsCount, setFriendsCount] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [tasks, setTasks] = useState<FriendTaskItem[]>([]);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [allowIncomingTasks, setAllowIncomingTasks] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const [categories, setCategories] = useState<StoredCategoryOption[]>(DEFAULT_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<StoredCategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<StoredCategoryOption>(DEFAULT_CATEGORIES[0]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_COLORS[0]);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);

  const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
  const [isScheduleModalVisible, setIsScheduleModalVisible] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSubtasks, setNewSubtasks] = useState<SubtaskItem[]>([createSubtask()]);
  const [selectedTaskDate, setSelectedTaskDate] = useState(() => formatDateKey(new Date()));
  const [selectedTaskHour, setSelectedTaskHour] = useState('09');
  const [selectedTaskMinute, setSelectedTaskMinute] = useState('00');
  const [isCustomScheduleEnabled, setIsCustomScheduleEnabled] = useState(false);
  const [isTaskTimeEnabled, setIsTaskTimeEnabled] = useState(false);
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(60);
  const [selectedRecurrence, setSelectedRecurrence] = useState<TaskSchedule['recurrence']>('today');
  const [editingSkipDates, setEditingSkipDates] = useState<string[]>([]);
  const [titleError, setTitleError] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [timeInputVisible, setTimeInputVisible] = useState(false);
  const [timeInputField, setTimeInputField] = useState<'hour' | 'minute'>('hour');
  const [timeInputValue, setTimeInputValue] = useState('');
  const titleErrorAnim = useMemo(() => new Animated.Value(0), []);
  const hourPanStepRef = useRef(0);
  const minutePanStepRef = useRef(0);
  const hourValueRef = useRef(Number(selectedTaskHour));
  const minuteValueRef = useRef(Number(selectedTaskMinute));
  const isFirstLoadRef = useRef(true);

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

  const resetTaskModalFields = useCallback(() => {
    const now = new Date();
    setNewTask('');
    setNewDescription('');
    setNewSubtasks([createSubtask()]);
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
    setTimeInputVisible(false);
    setTimeInputValue('');
  }, []);

  const openTimeInput = useCallback(
    (field: 'hour' | 'minute') => {
      setTimeInputField(field);
      setTimeInputValue(field === 'hour' ? selectedTaskHour : selectedTaskMinute);
      setTimeInputVisible(true);
    },
    [selectedTaskHour, selectedTaskMinute]
  );

  const applyTypedTimeValue = useCallback(() => {
    const raw = timeInputValue.replace(/\D/g, '');
    if (!raw.length) {
      Alert.alert('Hata', 'Lutfen sayi gir.');
      return;
    }

    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      Alert.alert('Hata', 'Lutfen gecerli bir sayi gir.');
      return;
    }

    if (timeInputField === 'hour') {
      if (numeric < 0 || numeric > 23) {
        Alert.alert('Hata', 'Saat 0 ile 23 arasinda olmali.');
        return;
      }
      setSelectedTaskHour(String(numeric).padStart(2, '0'));
    } else {
      if (numeric < 0 || numeric > 59) {
        Alert.alert('Hata', 'Dakika 0 ile 59 arasinda olmali.');
        return;
      }
      setSelectedTaskMinute(String(numeric).padStart(2, '0'));
    }

    setTimeInputVisible(false);
  }, [timeInputField, timeInputValue]);

  const loadData = useCallback(async () => {
    if (!friendId) {
      Alert.alert('Hata', 'Arkadas bilgisi bulunamadi.');
      router.back();
      return;
    }

    if (isFirstLoadRef.current) {
      setLoading(true);
    }

    const [profile, stats, storedTasks, canSend, storedCategories] = await Promise.all([
      loadFriendProfile(friendId),
      loadFriendStats(friendId),
      loadFriendTasks(friendId),
      loadCanFriendSendTasks(friendId),
      loadCustomCategories(),
    ]);

    const mergedCategories = mergeCategories(
      [DEFAULT_CATEGORIES[0]],
      storedCategories.length > 0 ? storedCategories : DEFAULT_CATEGORIES
    );

    setFriendName(profile.username || initialName);
    setAvatarUrl(profile.avatarUrl ?? (initialAvatarUrl || null));
    setFriendsCount(stats.friendsCount);
    setCompletedTasks(stats.completedTasks);
    setStreakDays(stats.streakDays);
    setTasks(storedTasks);
    setAllowIncomingTasks(canSend);
    setCategories(mergedCategories);
    setCustomCategories(storedCategories.length > 0 ? storedCategories : DEFAULT_CATEGORIES);
    setSelectedCategory((prev) => mergedCategories.find((item) => item.name === prev.name) || mergedCategories[0]);

    if (isFirstLoadRef.current) {
      setLoading(false);
      isFirstLoadRef.current = false;
    }
  }, [friendId, initialAvatarUrl, initialName, router]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      const handle = InteractionManager.runAfterInteractions(() => {
        const run = async () => {
          await loadData();
          if (!alive) return;
        };
        run();
      });

      return () => {
        alive = false;
        handle.cancel();
      };
    }, [loadData])
  );

  const openCreateTaskModal = () => {
    resetTaskModalFields();
    setIsTaskModalVisible(true);
  };

  const addSubtaskInput = () => {
    setNewSubtasks((prev) => [...prev, createSubtask()]);
  };

  const updateSubtaskInput = (id: string, value: string) => {
    setNewSubtasks((prev) => prev.map((item) => (item.id === id ? { ...item, title: value } : item)));
  };

  const toggleSubtaskInput = (id: string) => {
    setNewSubtasks((prev) => prev.map((item) => (item.id === id ? { ...item, is_completed: !item.is_completed } : item)));
  };

  const removeSubtaskInput = (id: string) => {
    setNewSubtasks((prev) => prev.filter((item) => item.id !== id));
  };

  const saveCategory = async () => {
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

    const createdCategory: StoredCategoryOption = {
      name: normalizedName,
      color: newCategoryColor,
    };

    const updatedCustom = mergeCategories(customCategories, [createdCategory]);
    setCustomCategories(updatedCustom);
    await saveCustomCategories(updatedCustom);
    setCategories((prev) => mergeCategories(prev, [createdCategory]));
    setSelectedCategory(createdCategory);

    setNewCategoryName('');
    setNewCategoryColor(DEFAULT_COLORS[0]);
    setIsCategoryModalVisible(false);
  };

  const handleAddTask = async () => {
    if (isSubmittingTask) {
      return;
    }

    const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
    if (!isUuid(friendId)) {
      Alert.alert('Hata', 'Arkadas kimligi gecersiz.');
      return;
    }

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

    const today = formatDateKey(new Date());
    const schedule: TaskSchedule = {
      name: selectedCategory.name,
      color: selectedCategory.color,
      date: isCustomScheduleEnabled ? selectedTaskDate : today,
      dueDateTime:
        isCustomScheduleEnabled && isTaskTimeEnabled ? `${isCustomScheduleEnabled ? selectedTaskDate : today}T${selectedTaskHour}:${selectedTaskMinute}` : null,
      reminderBeforeMinutes:
        isCustomScheduleEnabled && isTaskTimeEnabled && isReminderEnabled ? reminderBeforeMinutes : null,
      recurrence: selectedRecurrence,
      skipDates: editingSkipDates,
    };

    setIsSubmittingTask(true);
    setIsTaskModalVisible(false);

    try {
      const next = await addFriendTask(friendId, {
        task: newTask.trim(),
        description: newDescription.trim() || null,
        subtask: serializeFriendSubtasks(newSubtasks),
        category: JSON.stringify(schedule),
      });

      setTasks(next);
      resetTaskModalFields();
    } catch (error) {
      setIsTaskModalVisible(true);
      Alert.alert('Hata', error instanceof Error ? error.message : 'Gorev gonderilemedi.');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleRemoveTask = async (taskId: string) => {
    try {
      const next = await removeFriendTask(friendId, taskId);
      setTasks(next);
    } catch (error) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'Gorev silinemedi.');
    }
  };

  const toggleTaskDetails = (taskId: string) => {
    setExpandedTaskIds((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const toggleIncomingTaskPermission = async (value: boolean) => {
    setAllowIncomingTasks(value);
    await saveCanFriendSendTasks(friendId, value);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>

        <AppLogo size={38} />

        <TouchableOpacity style={styles.menuButton} onPress={() => setIsMenuVisible(true)}>
          <Feather name="more-vertical" size={18} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Feather name="user" size={34} color="#FFFFFF" />
            </View>
          )}

          <Text style={styles.friendName}>{friendName}</Text>
          <Text style={styles.friendLabel}>Arkadas profili</Text>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{friendsCount}</Text>
              <Text style={styles.statLabel}>Arkadas</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{completedTasks}</Text>
              <Text style={styles.statLabel}>Tamamlanan</Text>
            </View>
            <View style={styles.statCard}>
              <FlameStreakBadge days={streakDays} size={46} />
              <Text style={styles.statLabel}>Gunluk flame</Text>
            </View>
          </View>
        </View>

        <View style={styles.taskComposerCard}>
          <View style={styles.taskComposerHeader}>
            <Text style={styles.sectionTitle}>Gorev ver</Text>
            <Text style={styles.sectionSubtitle}>Home ekranindaki modal ile ayni mantikta gorev ekle.</Text>
          </View>

          <TouchableOpacity style={styles.openModalButton} onPress={openCreateTaskModal}>
            <Feather name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.openModalButtonText}>Gorev modalini ac</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listHeaderRow}>
          <Text style={styles.sectionTitle}>Verdigin gorevler</Text>
          <Text style={styles.taskCountText}>{tasks.length} adet</Text>
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateText}>Henuz gorev eklenmedi.</Text>
          </View>
        ) : (
          tasks.map((item) => {
            const subtasks = parseFriendSubtasks(item.subtask);
            const schedule = parseFriendSchedule(item.category);
            const expanded = Boolean(expandedTaskIds[item.id]);

            return (
              <TouchableOpacity key={item.id} style={styles.taskItemCard} activeOpacity={0.85} onPress={() => toggleTaskDetails(item.id)}>
                <View style={styles.taskItemTopRow}>
                  <View style={styles.taskItemTextWrap}>
                    <Text style={styles.taskItemTitle}>{item.task}</Text>
                    {expanded && item.description ? <Text style={styles.taskItemDescription}>{item.description}</Text> : null}
                  </View>
                  <TouchableOpacity style={styles.taskDeleteButton} onPress={() => handleRemoveTask(item.id)}>
                    <Feather name="x" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.taskOwnerHint}>Bu gorev arkadas ekraninda gorunur.</Text>

                {schedule ? (
                  <View style={styles.scheduleChipRow}>
                    <View style={[styles.scheduleChip, { borderColor: schedule.color }]}> 
                      <View style={[styles.scheduleDot, { backgroundColor: schedule.color }]} />
                      <Text style={styles.scheduleChipText}>{schedule.name}</Text>
                    </View>
                    {schedule.date ? (
                      <View style={styles.scheduleChip}>
                        <Text style={styles.scheduleChipText}>{schedule.date}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {expanded && subtasks.length > 0 ? (
                  <View style={styles.subtaskPreviewList}>
                    {subtasks.map((subtask) => (
                      <View key={subtask.id} style={styles.subtaskPreviewRow}>
                        <View style={[styles.subtaskPreviewDot, subtask.is_completed && styles.subtaskPreviewDotDone]} />
                        <Text style={styles.subtaskPreviewText}>{subtask.title}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={isTaskModalVisible} animationType="slide" transparent onRequestClose={() => setIsTaskModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Yeni Gorev</Text>

            <Animated.View
              style={[
                styles.titleInputWrap,
                {
                  borderColor: titleError ? '#DC2626' : '#E5E7EB',
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
                placeholder="Task title"
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

            <View style={styles.subtaskInputList}>
              {newSubtasks.map((subtask) => (
                <View key={subtask.id} style={styles.subtaskInputRow}>
                  <TouchableOpacity onPress={() => toggleSubtaskInput(subtask.id)}>
                    <View style={[styles.subtaskRadio, subtask.is_completed && styles.radioSelected]}>
                      {subtask.is_completed ? <Feather name="check" size={12} color="white" /> : null}
                    </View>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.subtaskInput}
                    placeholder="Subtask"
                    value={subtask.title}
                    onChangeText={(value) => updateSubtaskInput(subtask.id, value)}
                  />
                  <TouchableOpacity onPress={() => removeSubtaskInput(subtask.id)}>
                    <Feather name="x" size={16} color="#777" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <Text style={styles.categoryTitle}>Category</Text>
            <View style={styles.categoryRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScrollContent}>
                {categories.map((category) => {
                  const isSelected = selectedCategory.name === category.name;
                  return (
                    <TouchableOpacity
                      key={category.name}
                      style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                      onPress={() => setSelectedCategory(category)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.categoryColorDot, { backgroundColor: category.color }]} />
                      <Text style={styles.categoryOptionText}>{category.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity style={styles.categoryAddOnlyButton} onPress={() => setIsCategoryModalVisible(true)}>
                <AntDesign name="plus" size={18} color="black" />
              </TouchableOpacity>
            </View>

            <View style={styles.scheduleRow}>
              <Text style={styles.categoryTitle}>Tarih</Text>
              <View style={styles.scheduleActionRow}>
                <TouchableOpacity
                  style={[styles.scheduleHorizontalButton, isCustomScheduleEnabled && styles.scheduleHorizontalButtonActive]}
                  onPress={() => setIsScheduleModalVisible(true)}
                >
                  <Feather name="calendar" size={16} color={isCustomScheduleEnabled ? '#111827' : '#4B5563'} />
                  <Text style={styles.scheduleHorizontalButtonText}>
                    {isCustomScheduleEnabled
                      ? formatSchedulePreview(selectedTaskDate, selectedTaskHour, selectedTaskMinute)
                      : 'Ozel tarih ekle'}
                  </Text>
                </TouchableOpacity>
                {isCustomScheduleEnabled ? (
                  <TouchableOpacity style={styles.clearScheduleButton} onPress={() => setIsCustomScheduleEnabled(false)}>
                    <Feather name="x" size={14} color="#6B7280" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.recurrenceRow}>
              <Text style={styles.categoryTitle}>Gorev Tekrari</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recurrenceOptionsRow}>
                {RECURRENCE_OPTIONS.map((option) => {
                  const selected = selectedRecurrence === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.recurrenceOption, selected && styles.recurrenceOptionSelected]}
                      onPress={() => setSelectedRecurrence(option.value)}
                    >
                      <Text style={[styles.recurrenceOptionText, selected && styles.recurrenceOptionTextSelected]}>
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
                disabled={isSubmittingTask}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButtonAdd, isSubmittingTask && styles.modalButtonAddDisabled]} onPress={handleAddTask} disabled={isSubmittingTask}>
                <Text style={[styles.modalButtonText, { color: 'white' }]}>{isSubmittingTask ? 'Gonderiliyor...' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isScheduleModalVisible} animationType="slide" transparent onRequestClose={() => setIsScheduleModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.scheduleModalCard]}>
            <Text style={styles.modalTitle}>Tarih ve Saat</Text>

            <Calendar
              current={selectedTaskDate}
              onDayPress={(day: { dateString: string }) => setSelectedTaskDate(day.dateString)}
              markedDates={{
                [selectedTaskDate]: {
                  selected: true,
                  selectedColor: '#111',
                },
              }}
              style={styles.scheduleCalendar}
            />

            <View style={styles.timePickerWrap}>
              <TouchableOpacity
                style={[styles.timeMainButton, isTaskTimeEnabled && styles.timeMainButtonActive]}
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
                <Feather name="clock" size={16} color={isTaskTimeEnabled ? '#111827' : '#4B5563'} />
                <Text style={styles.timeMainButtonText}>
                  {isTaskTimeEnabled ? `Saat Secildi (${selectedTaskHour}:${selectedTaskMinute})` : 'Saat Ekleme (Istege Bagli)'}
                </Text>
              </TouchableOpacity>

              {isTaskTimeEnabled ? (
                <View style={styles.timeWheelRow}>
                  <View style={styles.timeWheelCard} {...hourPanResponder.panHandlers}>
                    <TouchableOpacity onPress={() => changeHourBy(1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="chevron-up" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.timeWheelValueButton}
                      onPress={() => openTimeInput('hour')}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.timeWheelValue}>{selectedTaskHour}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => changeHourBy(-1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="chevron-down" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.timeBigSeparator}>:</Text>

                  <View style={styles.timeWheelCard} {...minutePanResponder.panHandlers}>
                    <TouchableOpacity onPress={() => changeMinuteBy(1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="chevron-up" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.timeWheelValueButton}
                      onPress={() => openTimeInput('minute')}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.timeWheelValue}>{selectedTaskMinute}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => changeMinuteBy(-1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="chevron-down" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.reminderRow}>
              <View style={styles.reminderTextWrap}>
                <Text style={styles.reminderTitle}>Hatirlatma</Text>
                <Text style={styles.reminderSubtitle}>Gorev zamanindan once uyar.</Text>
              </View>
              <Switch value={isReminderEnabled} onValueChange={setIsReminderEnabled} />
            </View>

            {isReminderEnabled ? (
              <View style={styles.reminderPillRow}>
                {[15, 30, 60, 120].map((minutes) => (
                  <TouchableOpacity
                    key={minutes}
                    style={[styles.reminderPill, reminderBeforeMinutes === minutes && styles.reminderPillSelected]}
                    onPress={() => setReminderBeforeMinutes(minutes)}
                  >
                    <Text style={[styles.reminderPillText, reminderBeforeMinutes === minutes && styles.reminderPillTextSelected]}>
                      {minutes} dk
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

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

      <Modal visible={timeInputVisible} animationType="fade" transparent onRequestClose={() => setTimeInputVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.timeInputModalCard]}>
            <Text style={styles.modalTitle}>{timeInputField === 'hour' ? 'Saat Gir' : 'Dakika Gir'}</Text>

            <TextInput
              style={styles.timeInputField}
              value={timeInputValue}
              onChangeText={(text) => setTimeInputValue(text.replace(/\D/g, '').slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
              autoFocus
              placeholder={timeInputField === 'hour' ? '00-23' : '00-59'}
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setTimeInputVisible(false)}>
                <Text style={styles.modalButtonText}>Iptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonAdd} onPress={applyTypedTimeValue}>
                <Text style={[styles.modalButtonText, { color: 'white' }]}>Uygula</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isCategoryModalVisible} animationType="slide" transparent onRequestClose={() => setIsCategoryModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.categoryModalCard]}>
            <Text style={styles.modalTitle}>Kategori Ekle</Text>
            <TextInput
              style={styles.input}
              placeholder="Kategori adi"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
              {DEFAULT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.colorSwatch, { backgroundColor: color }, newCategoryColor === color && styles.colorSwatchSelected]}
                  onPress={() => setNewCategoryColor(color)}
                />
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setIsCategoryModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonAdd} onPress={saveCategory}>
                <Text style={[styles.modalButtonText, { color: 'white' }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isMenuVisible} transparent animationType="fade" onRequestClose={() => setIsMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setIsMenuVisible(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Ayarlar</Text>
            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text style={styles.switchTitle}>Bu kisi bana task gonderebilir</Text>
                <Text style={styles.switchSubtitle}>Bu izin acik ise arkadasina gorev yollayabilirsin.</Text>
              </View>
              <Switch value={allowIncomingTasks} onValueChange={toggleIncomingTaskPermission} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#111827" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F8',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingBottom: 28,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  friendName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  friendLabel: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    alignSelf: 'stretch',
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 104,
  },
  statValue: {
    fontSize: 21,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  taskComposerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  taskComposerHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  openModalButton: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  openModalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  taskCountText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 22,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#6B7280',
    fontSize: 14,
  },
  taskItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 10,
  },
  taskItemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  taskItemTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  taskItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  taskOwnerHint: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  taskItemDescription: {
    marginTop: 4,
    fontSize: 13,
    color: '#4B5563',
  },
  taskDeleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskMetaBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#FAFAFA',
    marginBottom: 10,
  },
  taskMetaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 2,
  },
  taskMetaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  scheduleChipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  scheduleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  scheduleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scheduleChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  subtaskPreviewList: {
    gap: 8,
  },
  subtaskPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtaskPreviewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  subtaskPreviewDotDone: {
    backgroundColor: '#111827',
  },
  subtaskPreviewText: {
    fontSize: 13,
    color: '#374151',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: '88%',
  },
  scheduleModalCard: {
    maxHeight: '92%',
  },
  timeInputModalCard: {
    maxHeight: '40%',
  },
  categoryModalCard: {
    maxHeight: '55%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  titleInputWrap: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  titleInput: {
    height: 48,
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 15,
  },
  titleErrorText: {
    marginTop: -4,
    marginBottom: 8,
    color: '#DC2626',
    fontSize: 12,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    marginBottom: 10,
  },
  subtaskHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  smallPlusButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskInputList: {
    gap: 8,
    marginBottom: 10,
  },
  subtaskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtaskRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  subtaskInput: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  categoryScrollContent: {
    gap: 8,
    paddingRight: 4,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  categoryOptionSelected: {
    borderColor: '#111827',
    backgroundColor: '#F9FAFB',
  },
  categoryColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryOptionText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  categoryAddOnlyButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleRow: {
    marginBottom: 12,
  },
  scheduleActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scheduleHorizontalButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  scheduleHorizontalButtonActive: {
    backgroundColor: '#F9FAFB',
    borderColor: '#111827',
  },
  scheduleHorizontalButtonText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  clearScheduleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurrenceRow: {
    marginBottom: 12,
  },
  recurrenceOptionsRow: {
    gap: 8,
    paddingRight: 4,
  },
  recurrenceOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  recurrenceOptionSelected: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  recurrenceOptionText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  recurrenceOptionTextSelected: {
    color: '#FFFFFF',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalButtonCancel: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalButtonAdd: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  modalButtonAddDisabled: {
    opacity: 0.7,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  scheduleCalendar: {
    marginBottom: 10,
  },
  timePickerWrap: {
    marginBottom: 10,
  },
  timeMainButton: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  timeMainButtonActive: {
    borderColor: '#111827',
    backgroundColor: '#F9FAFB',
  },
  timeMainButtonText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  timeWheelRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  timeWheelCard: {
    width: 94,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  timeWheelValueButton: {
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  timeWheelValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  timeBigSeparator: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  timeInputField: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    marginBottom: 10,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  reminderTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  reminderSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  reminderPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  reminderPill: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  reminderPillSelected: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  reminderPillText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  reminderPillTextSelected: {
    color: '#FFFFFF',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 16,
  },
  menuCard: {
    width: 300,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  switchSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorRow: {
    gap: 8,
    paddingVertical: 6,
    marginBottom: 12,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#111827',
  },
});
