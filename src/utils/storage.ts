import {
  Kelas,
  MataPelajaran,
  ProfilGuru,
  Siswa,
  JadwalMengajar,
  JurnalKBM,
  AbsensiRecord,
  NilaiRecord,
  UserAccount,
  PengaturanSekolah,
} from '../types/siagu';
import {
  initialProfilGuru,
  initialKelas,
  initialMapel,
  initialSiswa,
  initialJadwal,
  initialAbsensi,
  initialNilai,
  initialJurnal,
  initialAccounts,
  initialPengaturanSekolah,
} from '../data/initialData';
import { saveToFirestore, fetchFromFirestore } from './firebase';

const STORAGE_KEY = 'siagu_app_data_v6';

export interface SiaguState {
  currentUser: UserAccount | null;
  accounts: UserAccount[];
  pengaturanSekolah: PengaturanSekolah;
  profil: ProfilGuru;
  kelas: Kelas[];
  mapel: MataPelajaran[];
  siswa: Siswa[];
  jadwal: JadwalMengajar[];
  absensi: AbsensiRecord[];
  nilai: NilaiRecord[];
  jurnal: JurnalKBM[];
  activeKelasId: string;
}

function mergeStandardMapel(savedMapel?: MataPelajaran[]): MataPelajaran[] {
  if (!savedMapel || savedMapel.length === 0) return initialMapel;
  const existingMap = new Map(savedMapel.map((m) => [m.id.toLowerCase(), m]));
  const result = [...savedMapel];
  initialMapel.forEach((std) => {
    if (!existingMap.has(std.id.toLowerCase())) {
      result.push(std);
    }
  });
  return result;
}

export function loadSiaguData(): SiaguState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getFactoryDefaultData();
    }
    const parsed = JSON.parse(raw);
    return {
      currentUser: parsed.currentUser !== undefined ? parsed.currentUser : null,
      accounts: parsed.accounts || initialAccounts,
      pengaturanSekolah: parsed.pengaturanSekolah || initialPengaturanSekolah,
      profil: parsed.profil || initialProfilGuru,
      kelas: parsed.kelas || initialKelas,
      mapel: mergeStandardMapel(parsed.mapel),
      siswa: parsed.siswa || initialSiswa,
      jadwal: parsed.jadwal || initialJadwal,
      absensi: parsed.absensi || initialAbsensi,
      nilai: parsed.nilai || initialNilai,
      jurnal: parsed.jurnal || initialJurnal,
      activeKelasId: parsed.activeKelasId || '7A',
    };
  } catch (err) {
    console.error('Failed to load SIAGU data from localStorage:', err);
    return getFactoryDefaultData();
  }
}

export function saveSiaguDataToLocalOnly(state: SiaguState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save SIAGU data to localStorage:', err);
  }
}

export function saveSiaguData(state: SiaguState): void {
  try {
    const jsonStr = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, jsonStr);

    // 1. Primary: Save to Firebase Firestore cloud database for global multi-device sync
    saveToFirestore(jsonStr, state.currentUser?.nama || 'Admin/Guru').catch((err) => {
      console.warn('[Storage] Firestore save warning:', err);
    });

    // 2. Secondary backup: push to container server endpoint
    fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStr,
    }).catch(() => {
      // Ignore network errors when offline
    });
  } catch (err) {
    console.error('Failed to save SIAGU data:', err);
  }
}

export async function fetchServerSiaguData(): Promise<SiaguState | null> {
  // 1. Primary Priority: Fetch directly from Firebase Firestore Cloud Database
  try {
    const firestoreJson = await fetchFromFirestore();
    if (firestoreJson) {
      const data = JSON.parse(firestoreJson);
      if (data && Array.isArray(data.siswa)) {
        const cloudState: SiaguState = {
          currentUser: null, // Keep login prompt active
          accounts: data.accounts || initialAccounts,
          pengaturanSekolah: data.pengaturanSekolah || initialPengaturanSekolah,
          profil: data.profil || initialProfilGuru,
          kelas: data.kelas || initialKelas,
          mapel: mergeStandardMapel(data.mapel),
          siswa: data.siswa || initialSiswa,
          jadwal: data.jadwal || initialJadwal,
          absensi: data.absensi || initialAbsensi,
          nilai: data.nilai || initialNilai,
          jurnal: data.jurnal || initialJurnal,
          activeKelasId: data.activeKelasId || '7A',
        };
        saveSiaguDataToLocalOnly(cloudState);
        return cloudState;
      }
    }
  } catch (firestoreErr) {
    console.warn('[Storage] Fetch from Firestore failed, trying server API:', firestoreErr);
  }

  // 2. Secondary Fallback: Fetch from container /api/data
  try {
    const res = await fetch('/api/data');
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
      return null;
    }
    const data = JSON.parse(text);
    if (data && !data.empty && Array.isArray(data.siswa)) {
      const serverState: SiaguState = {
        currentUser: null, // Keep login prompt active
        accounts: data.accounts || initialAccounts,
        pengaturanSekolah: data.pengaturanSekolah || initialPengaturanSekolah,
        profil: data.profil || initialProfilGuru,
        kelas: data.kelas || initialKelas,
        mapel: mergeStandardMapel(data.mapel),
        siswa: data.siswa || initialSiswa,
        jadwal: data.jadwal || initialJadwal,
        absensi: data.absensi || initialAbsensi,
        nilai: data.nilai || initialNilai,
        jurnal: data.jurnal || initialJurnal,
        activeKelasId: data.activeKelasId || '7A',
      };
      saveSiaguDataToLocalOnly(serverState);
      return serverState;
    }
  } catch (err) {
    // Return null if network or parse error
  }
  return null;
}

export function getFactoryDefaultData(): SiaguState {
  const state: SiaguState = {
    currentUser: null, // First screen when deployed/opened is Portal Login
    accounts: initialAccounts,
    pengaturanSekolah: initialPengaturanSekolah,
    profil: initialProfilGuru,
    kelas: initialKelas,
    mapel: initialMapel,
    siswa: initialSiswa,
    jadwal: initialJadwal,
    absensi: initialAbsensi,
    nilai: initialNilai,
    jurnal: initialJurnal,
    activeKelasId: '7A',
  };
  saveSiaguDataToLocalOnly(state);
  return state;
}

export function exportSiaguBackupJSON(state: SiaguState): void {
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SIAGU_Backup_${state.profil.nama.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
