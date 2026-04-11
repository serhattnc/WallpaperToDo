import { loadProfileAvatar, saveProfileAvatar } from '@/constants/friends-storage';
import { supabase } from '@/constants/supabase';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
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
    const userId = user?.id || '';
    const nameFromMeta =
      metadata.full_name || metadata.name || metadata.given_name || session.user.email?.split('@')[0] || 'Guest';
    const avatarFromMeta = metadata.avatar_url || metadata.picture || null;

    let avatarFromStorage: string | null = null;
    if (userId) {
      avatarFromStorage = await loadProfileAvatar(userId);
    }

    setCurrentUserId(userId);
    setDisplayName(String(nameFromMeta));
    setEmail(session.user.email || '');
    setAvatarUrl(avatarFromStorage || (typeof avatarFromMeta === 'string' ? avatarFromMeta : null));
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePickAvatar = useCallback(async () => {
    if (!currentUserId) {
      Alert.alert('Hata', 'Profil bilgisi yuklenemedi. Lutfen tekrar dene.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Izin Gerekli', 'Profil fotografi secmek icin galeri izni vermelisin.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    try {
      setUploadingAvatar(true);
      const uploadedUrl = await saveProfileAvatar(currentUserId, result.assets[0].uri);
      setAvatarUrl(uploadedUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Avatar yuklenirken bir hata olustu.';
      Alert.alert('Hata', message);
    } finally {
      setUploadingAvatar(false);
    }
  }, [currentUserId]);

  const handleSave = useCallback(async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      Alert.alert('Hata', 'Gorunen ad bos olamaz.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: trimmedName,
        name: trimmedName,
      },
    });

    if (error) {
      Alert.alert('Hata', error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    Alert.alert('Basarili', 'Profil bilgileri guncellendi.');
    router.back();
  }, [displayName, router]);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profili Degistir</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#111827" />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.avatarBlock}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarMask}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Feather name="user" size={28} color="#111827" />
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.avatarIconButton} onPress={handlePickAvatar} disabled={uploadingAvatar}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="camera" size={14} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.avatarHintText}>Icondan profil fotografini degistirebilirsin</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Gorunen Ad</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Gorunen ad"
              placeholderTextColor="#9CA3AF"
              maxLength={40}
            />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  headerRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingTop: 20,
    gap: 14,
  },
  avatarBlock: {
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
  },
  avatarMask: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
    overflow: 'hidden',
  },
  avatarIconButton: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  avatarHintText: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,

  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    height: 46,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F3F4F6',
  },
  emailText: {
    marginTop: 10,
    fontSize: 13,
    color: '#4B5563',
  },
  saveButton: {
    marginTop: 'auto',
    marginBottom: 12,
    height: 50,
    backgroundColor: '#111111',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
