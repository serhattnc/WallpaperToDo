import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, AntDesign, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/constants/supabase';
import { useRouter } from 'expo-router';

type Task = {
  id: number;
  task: string;
  is_completed: boolean;
};

export default function HomeScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.error('Error fetching tasks:', error);
    } else {
      setTasks(data || []);
    }
  };

  const addTask = async () => {
    if (!newTask.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('todos')
      .insert([{ task: newTask, user_id: user.id }]);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewTask('');
      setIsModalVisible(false);
      fetchTasks();
    }
  };

  const toggleTask = async (id: number, is_completed: boolean) => {
    const { error } = await supabase
      .from('todos')
      .update({ is_completed: !is_completed })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      fetchTasks();
    }
  };

  const deleteTask = async (id: number) => {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      fetchTasks();
    }
  };

  const renderItem = ({ item }: { item: Task }) => (
    <View style={styles.taskItem}>
      <TouchableOpacity onPress={() => toggleTask(item.id, item.is_completed)} style={styles.taskLeft}>
        <View style={[styles.radio, item.is_completed && styles.radioSelected]}>
            {item.is_completed && <Feather name="check" size={14} color="white" />}
        </View>
        <Text style={[styles.taskText, item.is_completed && styles.taskCompleted]}>{item.task}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => deleteTask(item.id)}>
        <Feather name="x" size={20} color="#999" />
      </TouchableOpacity>
    </View>
  );

  const currentDate = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
            <Feather name="check" size={32} color="black" />
        </View>
        <Text style={styles.dateText}>{currentDate}</Text>
      </View>

      {/* Tasks Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Todays Tasks</Text>
          <TouchableOpacity>
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={tasks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No tasks for today</Text>}
        />

        <TouchableOpacity style={styles.addButton} onPress={() => setIsModalVisible(true)}>
          <AntDesign name="plus" size={24} color="black" />
        </TouchableOpacity>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.actionCard}>
          <AntDesign name="plus" size={20} color="black" style={{marginBottom: 8}}/>
          <Text style={styles.actionText}>Add background</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
            <Feather name="clipboard" size={20} color="black" style={{marginBottom: 8}}/>
          <Text style={styles.actionText}>My backgrounds</Text>
        </TouchableOpacity>
      </View>

      {/* Banner */}
      <View style={styles.banner}>
        <Feather name="user-plus" size={20} color="black" style={{marginRight: 10}}/>
        <Text style={styles.bannerText}>Work with friends</Text>
      </View>

        {/* Add Task Modal */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Add New Task</Text>
                <TextInput 
                    style={styles.input}
                    placeholder="Enter task..."
                    value={newTask}
                    onChangeText={setNewTask}
                    autoFocus
                />
                <View style={styles.modalButtons}>
                    <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setIsModalVisible(false)}>
                        <Text style={styles.modalButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalButtonAdd} onPress={addTask}>
                        <Text style={[styles.modalButtonText, {color: 'white'}]}>Add</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

      {/* Bottom Navigation Placeholder (Visual Only as per design request) */}
        <View style={styles.bottomNav}>
            <Feather name="home" size={24} color="black" />
            <Feather name="calendar" size={24} color="black" />
            <View style={styles.navPlusContainer}>
                <AntDesign name="plus" size={24} color="black" />
            </View>
             <Feather name="clipboard" size={24} color="black" />
             <Feather name="user" size={24} color="black" />
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
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateText: {
    color: '#666',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    flex: 1, // Take available space
    marginBottom: 20,
    position: 'relative',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  editText: {
    color: '#999',
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 40,
  },
  taskItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E0E0E0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  taskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#666',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    backgroundColor: 'black',
    borderColor: 'black',
  },
  taskText: {
    fontSize: 14,
    color: '#333',
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
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
    shadowColor: "#000",
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
    width: '80%',
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
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
      borderTopColor: '#eee'
  },
  navPlusContainer: {
      width: 40,
      height: 40,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: 'black',
      justifyContent: 'center',
      alignItems: 'center'
  }
});
