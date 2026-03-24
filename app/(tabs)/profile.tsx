import AppLogo from '@/components/app-logo';
import FlameStreakBadge from '@/components/flame-streak-badge';
import SideSlider from '@/components/side-slider';
import { supabase } from '@/constants/supabase';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    InteractionManager,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RecurrenceOption = 'today' | 'daily' | 'weekend' | 'weekday';

type CategoryMeta = {
  date?: string;
  recurrence?: RecurrenceOption;
  skipDates?: string[];
};

type TodoRow = {
  id: number | string;
  is_completed: boolean;
  category?: string | null;
};

const normalizeRecurrence = (value?: string | null): RecurrenceOption => {
  if (value === 'daily' || value === 'weekend' || value === 'weekday' || value === 'today') {
    return value;
  }
  return 'today';
};

const formatDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const offsetDateKey = (baseDateKey: string, offsetDays: number) => {
  const [year, month, day] = baseDateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  return formatDateKey(date);
};

const parseCategoryMeta = (value?: string | null): CategoryMeta | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as CategoryMeta;
    return {
      date: parsed.date,
      recurrence: normalizeRecurrence(parsed.recurrence),
      skipDates: Array.isArray(parsed.skipDates)
        ? parsed.skipDates.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return null;
  }
};

const isTaskVisibleOnDate = (task: TodoRow, targetDate: string, todayDate: string) => {
  const categoryMeta = parseCategoryMeta(task.category);
  const taskDate = categoryMeta?.date;
  if (!taskDate) {
    return targetDate === todayDate;
  }

  if (targetDate < taskDate) return false;

  if ((categoryMeta?.skipDates || []).includes(targetDate)) return false;

  const recurrence = normalizeRecurrence(categoryMeta?.recurrence);
  if (recurrence === 'today') return targetDate === taskDate;
  if (recurrence === 'daily') return true;

  const dayOfWeek = new Date(`${targetDate}T00:00:00`).getDay();
  if (recurrence === 'weekend') return dayOfWeek === 0 || dayOfWeek === 6;
  return dayOfWeek >= 1 && dayOfWeek <= 5;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [isSideMenuVisible, setIsSideMenuVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('Guest');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [streakDays, setStreakDays] = useState(0);

  const fetchProfileData = useCallback(async () => {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace('/login');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const metadata = user?.user_metadata || {};
    const nameFromMeta =
      metadata.full_name || metadata.name || metadata.given_name || session.user.email?.split('@')[0] || 'Guest';
    const avatarFromMeta = metadata.avatar_url || metadata.picture || null;
    const friendValue = Number(metadata.friends_count ?? metadata.friendsCount ?? 0);

    setDisplayName(String(nameFromMeta));
    setEmail(session.user.email || '');
    setAvatarUrl(typeof avatarFromMeta === 'string' ? avatarFromMeta : null);
    setFriendsCount(Number.isFinite(friendValue) ? friendValue : 0);

    const { data, error } = await supabase
      .from('todos')
      .select('id, is_completed, category, user_id')
      .eq('user_id', session.user.id)
      .order('id', { ascending: true });

    if (!error && Array.isArray(data)) {
      const allTasks = data as TodoRow[];
      setCompletedTasks(allTasks.filter((task) => task.is_completed).length);

      const todayKey = formatDateKey(new Date());
      let streak = 0;
      for (let i = 0; i < 365; i += 1) {
        const targetDate = offsetDateKey(todayKey, -i);
        const dayTasks = allTasks.filter((task) => isTaskVisibleOnDate(task, targetDate, todayKey));
        if (dayTasks.length === 0) break;

        const allDone = dayTasks.every((task) => task.is_completed);
        if (!allDone) break;

        streak += 1;
      }

      setStreakDays(streak);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      fetchProfileData();
    });

    return () => handle.cancel();
  }, [fetchProfileData]);

  const headerSubtitle = useMemo(() => {
    if (!email) return 'Google hesabiniz ile bagli profil';
    return email;
  }, [email]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerMenuButton} onPress={() => setIsSideMenuVisible(true)}>
          <Feather name="menu" size={22} color="#111827" />
        </TouchableOpacity>
        <AppLogo size={40} />
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Feather name="user" size={28} color="#111827" />
            </View>
          )}
        </View>

        <Text style={styles.nameText}>{displayName}</Text>
        <Text style={styles.emailText}>{headerSubtitle}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#111827" size="small" />
        </View>
      ) : (
        <View style={styles.metricsContainer}>
          <View style={styles.metricItem}>
            <Text style={styles.statTitle}>Tamamlanan Gorev</Text>
            <Text style={styles.statValue}>{completedTasks}</Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricItem}>
            <Text style={styles.statTitle}>Arkadas Sayisi</Text>
            <Text style={styles.statValue}>{friendsCount}</Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={[styles.metricItem, styles.metricItemFlame]}>
            <View >
              <FlameStreakBadge days={streakDays} size={55}/>
            </View>
          </View>
        </View>
      )}

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.navigate('/(tabs)/home')}>
          <Feather name="home" size={24} color="black" />
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
        <TouchableOpacity style={styles.tabItem} onPress={() => router.navigate('/(tabs)/profile')}>
          <Feather name="user" size={24} color="black" />
          <View style={styles.activeTabDot} />
        </TouchableOpacity>
      </View>

      <SideSlider
        visible={isSideMenuVisible}
        onClose={() => setIsSideMenuVisible(false)}
        currentRoute="profile"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
    paddingTop: 6,
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
  },
  profileCard: {
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  nameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  emailText: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 12,
    marginBottom: 18,
  },
  metricItem: {
    flex: 1,
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricItemFlame: {
    minHeight: 92,
  },
  metricDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 8,
    backgroundColor: '#E5E7EB',
  },
  statTitle: {
    fontSize: 11,
    color: '#111111',
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 24,
    color: '#111827',
    fontWeight: '900',
  },

  
  bottomNav: {
    marginTop: 'auto',
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
  streakday:{
    paddingBottom: 400,
  }
});
