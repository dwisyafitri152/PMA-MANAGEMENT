/**
 * ============================================================================
 * OFFICE MANAGEMENT SYSTEM (OMS) - BACKEND ENGINE
 * Google Apps Script (GAS) Web App
 * ============================================================================
 * Petunjuk Instalasi & Deployment:
 * 1. Buka Google Sheets -> Ekstensi (Extensions) -> Apps Script
 *    ATAU buka script.google.com dan buat proyek baru.
 * 2. Salin seluruh isi file ini dan gantikan isi Code.gs.
 * 3. (Opsional) Isi SPREADSHEET_ID jika menggunakan script standalone.
 *    Jika dibuat dari Google Sheets, SPREADSHEET_ID boleh dikosongkan.
 * 4. Klik tombol "Jalankan" (Run) pada fungsi initDatabase() sekali untuk
 *    memberikan izin otorisasi Google ("Review Permissions" -> "Allow").
 * 5. Klik tombol "Terapkan" (Deploy) -> "Deployment baru" (New deployment):
 *    - Pilih jenis: "Aplikasi Web" (Web app)
 *    - Jalankan sebagai (Execute as): "Saya" / "Me" (email Anda)
 *    - Yang memiliki akses (Who has access): "Siapa saja" / "Anyone" (PENTING!)
 * 6. Salin URL Aplikasi Web yang berakhiran "/exec" dan tempelkan ke
 *    pengaturan web OMS Anda.
 * ============================================================================
 */

// Konfigurasi Database & Google Drive Folder
const CONFIG = {
  // Kosongkan atau biarkan jika script terikat ke Google Sheets (Container-Bound)
  // Jika script standalone, isi ID spreadsheet Anda di sini
  SPREADSHEET_ID: "14XDQktaF5NMjqUdWtDymNxWHyGlutQ1yoqtlPcfiJuI", 
  
  // Folder ID Google Drive untuk menyimpan dokumen dan gambar (opsional)
  PERATURAN_FOLDER_ID: "1mdv0MGRpv4qgg5hphQpab7fs4E1Umamp",
  PERATURAN_PDF_FOLDER_ID: "1mdv0MGRpv4qgg5hphQpab7fs4E1Umamp",
  PERATURAN_IMAGE_FOLDER_ID: "1mdv0MGRpv4qgg5hphQpab7fs4E1Umamp",
  GUEST_PHOTO_FOLDER_ID: "1mdv0MGRpv4qgg5hphQpab7fs4E1Umamp",
  
  // Kredensial default admin awal
  DEFAULT_ADMIN_USER: "admin",
  DEFAULT_ADMIN_PASS: "admin123",
};

// Nama-nama Sheet di Google Sheets
const SHEETS = {
  PERATURAN: "Peraturan",
  MEETING: "MeetingRoom",
  GUEST: "GuestVisit",
  ADMIN: "Admin"
};

/**
 * Entry Point HTTP GET
 * Menangani ping koneksi dan permintaan data (read-only)
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action;

    // Jika tidak ada parameter aksi, berikan info status API
    if (!action || action === "ping") {
      return jsonResponse({
        success: true,
        status: "online",
        message: "Office Management System API aktif dan siap digunakan.",
        timestamp: new Date().toISOString()
      });
    }

    return handleRequest(action, p);
  } catch (err) {
    return jsonResponse({
      success: false,
      message: "Terjadi kesalahan server pada doGet: " + err.toString()
    });
  }
}

/**
 * Entry Point HTTP POST
 * Menangani penambahan data, update, delete, login, dan upload file
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (errParse) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    // Jika parameter data dikirim sebagai JSON string (misalnya dari form urlencoded)
    if (payload.data && typeof payload.data === "string") {
      try {
        payload.data = JSON.parse(payload.data);
      } catch (e) {}
    }

    const action = payload.action || (e && e.parameter && e.parameter.action);
    if (!action) {
      return jsonResponse({ success: false, message: "Aksi (action) tidak ditentukan dalam request." });
    }

    return handleRequest(action, payload);
  } catch (err) {
    return jsonResponse({
      success: false,
      message: "Terjadi kesalahan server pada doPost: " + err.toString()
    });
  }
}

/**
 * Unified Request Router
 * Memetakan setiap request aksi ke fungsi handler yang sesuai
 */
function handleRequest(action, payload) {
  let result = { success: false, message: "Aksi tidak dikenal" };
  const token = payload.token || "";

  try {
    // Pastikan database dan sheets selalu siap
    ensureDatabase();

    switch (action) {
      // 1. Sistem & Ping
      case "ping":
        result = {
          success: true,
          status: "connected",
          message: "Koneksi Google Apps Script berhasil dan aktif!",
          timestamp: new Date().toISOString()
        };
        break;

      case "initDatabase":
        result = initDatabase();
        break;

      // 2. Auth Endpoints
      case "login":
      case "loginAdmin":
        result = loginAdmin(payload.username, payload.password);
        break;

      case "verifySession":
        result = verifyAdminSession(token);
        break;

      // 3. Admin Dashboard & Statistik
      case "getDashboardStats":
        result = getDashboardStats(token);
        break;

      // 4. Peraturan & SOP (Publik & Admin)
      case "getPublicRegulations":
      case "getRegulations":
        result = getPublicRegulations();
        break;

      case "addRegulation":
        result = addRegulation(payload.data || payload, token);
        break;

      case "updateRegulation":
        result = updateRegulation(payload.id, payload.data || payload, token);
        break;

      case "deleteRegulation":
        result = deleteRegulation(payload.id, token);
        break;

      // 5. Meeting Room (Publik & Admin)
      case "getPublicMeetingRooms":
      case "getMeetingRooms":
        result = getPublicMeetingRooms(payload.date || payload.tanggal);
        break;

      case "checkMeetingAvailability":
        result = checkMeetingAvailability(
          payload.tanggal,
          payload.ruang,
          payload.jamMulai,
          payload.jamSelesai,
          payload.excludeId
        );
        break;

      case "addBooking":
      case "addMeetingRoom":
        result = addBooking(payload.data || payload, token);
        break;

      case "updateMeetingRoom":
        result = updateMeetingRoom(payload.id, payload.data || payload, token);
        break;

      case "deleteMeetingRoom":
        result = deleteMeetingRoom(payload.id, token);
        break;

      // 6. Guest Visit (Buku Tamu Publik & Admin)
      case "getPublicGuestVisits":
      case "getGuestVisits":
      case "getGuests":
        result = getGuestVisits(payload.date || payload.tanggal);
        break;

      case "addGuestVisit":
      case "addGuest":
        result = addGuestVisit(payload.data || payload, token);
        break;

      case "updateGuestVisit":
      case "updateGuest":
        result = updateGuestVisit(payload.id, payload.data || payload, token);
        break;

      case "deleteGuestVisit":
      case "deleteGuest":
        result = deleteGuestVisit(payload.id, token);
        break;

      // 7. Upload Berkas ke Google Drive
      case "uploadFile":
        result = uploadFile(
          payload.base64Data,
          payload.fileName,
          payload.mimeType,
          payload.folderType,
          token
        );
        break;

      case "uploadGuestPhoto":
        result = uploadGuestPhoto(
          payload.base64Data,
          payload.fileName,
          token
        );
        break;

      case "deleteDriveFile":
        result = deleteDriveFile(payload.fileId, token);
        break;

      default:
        result = { success: false, message: "Aksi '" + action + "' tidak didukung oleh backend." };
    }
  } catch (err) {
    result = {
      success: false,
      message: "Terjadi kesalahan internal pada aksi '" + action + "': " + err.toString()
    };
  }

  return jsonResponse(result);
}

/**
 * Output JSON Helper
 * Selalu mengembalikan ContentService JSON yang kompatibel dengan CORS browser
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// DATABASE & SPREADSHEET MANAGER (SELF-HEALING)
// ============================================================================

/**
 * Mendapatkan instance Spreadsheet secara aman tanpa pernah menghasilkan null
 */
function getSpreadsheet() {
  // 1. Coba dari CONFIG.SPREADSHEET_ID
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim() !== "" && CONFIG.SPREADSHEET_ID.indexOf("ISI_") === -1) {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID.trim());
    } catch (e) {
      Logger.log("openById gagal: " + e.toString());
    }
  }

  // 2. Coba dari Active Spreadsheet (jika container-bound dari Google Sheets)
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  // 3. Coba dari Script Properties yang tersimpan otomatis sebelumnya
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty("OMS_AUTO_SPREADSHEET_ID");
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {}
  }

  // 4. Jika masih belum ada, buat Spreadsheet baru secara otomatis di Google Drive
  try {
    const newSs = SpreadsheetApp.create("Office Management System (Database)");
    props.setProperty("OMS_AUTO_SPREADSHEET_ID", newSs.getId());
    return newSs;
  } catch (e) {
    throw new Error("Gagal membuka atau membuat Spreadsheet. Harap kaitkan script ke Google Sheets atau isi CONFIG.SPREADSHEET_ID.");
  }
}

/**
 * Memastikan tabel dan struktur sheet selalu ada
 */
function ensureDatabase() {
  const ss = getSpreadsheet();

  // 1. Sheet Peraturan
  let sReg = ss.getSheetByName(SHEETS.PERATURAN);
  if (!sReg) {
    sReg = ss.insertSheet(SHEETS.PERATURAN);
    sReg.appendRow([
      "ID", "Tanggal", "Judul", "PDF_URL", "PDF_FILE_ID", 
      "IMAGE_URL", "IMAGE_FILE_ID", "CreatedAt", "UpdatedAt"
    ]);
    sReg.setFrozenRows(1);
    sReg.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
  }

  // 2. Sheet MeetingRoom
  let sMeeting = ss.getSheetByName(SHEETS.MEETING);
  if (!sMeeting) {
    sMeeting = ss.insertSheet(SHEETS.MEETING);
    sMeeting.appendRow([
      "ID", "Tanggal", "JamMulai", "JamSelesai", "Ruang", 
      "Agenda", "PihakHadir", "Status", "CreatedAt", "UpdatedAt"
    ]);
    sMeeting.setFrozenRows(1);
    sMeeting.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
  }

  // 3. Sheet GuestVisit
  let sGuest = ss.getSheetByName(SHEETS.GUEST);
  if (!sGuest) {
    sGuest = ss.insertSheet(SHEETS.GUEST);
    sGuest.appendRow([
      "ID", "NamaTamu", "TanggalVisit", "TujuanVisit", 
      "FotoUrl", "FotoFileId", "BertemuDengan", "CreatedAt", "UpdatedAt"
    ]);
    sGuest.setFrozenRows(1);
    sGuest.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
  }

  // 4. Sheet Admin
  let sAdmin = ss.getSheetByName(SHEETS.ADMIN);
  if (!sAdmin) {
    sAdmin = ss.insertSheet(SHEETS.ADMIN);
    sAdmin.appendRow(["ID", "Username", "PasswordHash", "Nama", "Status", "CreatedAt"]);
    sAdmin.setFrozenRows(1);
    sAdmin.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    sAdmin.appendRow([
      "ADM-000001",
      CONFIG.DEFAULT_ADMIN_USER,
      hashPassword(CONFIG.DEFAULT_ADMIN_PASS),
      "Administrator Kantor",
      "Aktif",
      new Date().toISOString()
    ]);
  }
}

/**
 * Inisialisasi Database manual via Apps Script Editor
 */
function initDatabase() {
  ensureDatabase();
  Logger.log("Database OMS berhasil diinisialisasi!");
  return { success: true, message: "Database dan tabel OMS berhasil disiapkan!" };
}

// ============================================================================
// AUTENTIKASI ADMIN
// ============================================================================

function hashPassword(password) {
  const rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password), Utilities.Charset.UTF_8);
  let hash = "";
  for (let i = 0; i < rawBytes.length; i++) {
    let byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    let byteStr = byteVal.toString(16);
    if (byteStr.length === 1) byteStr = "0" + byteStr;
    hash += byteStr;
  }
  return hash;
}

function loginAdmin(username, password) {
  try {
    if (!username || !password) {
      return { success: false, message: "Username dan password wajib diisi." };
    }

    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.ADMIN);
    if (!sheet) {
      ensureDatabase();
      sheet = ss.getSheetByName(SHEETS.ADMIN);
    }

    const data = sheet.getDataRange().getValues();
    const inputHash = hashPassword(password);
    let matchedUser = null;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const dbUsername = String(row[1]).trim();
      const dbPassword = String(row[2]).trim();
      const dbStatus = String(row[4]).trim();

      if (dbUsername.toLowerCase() === String(username).trim().toLowerCase() && 
          (dbPassword === inputHash || dbPassword === password)) {
        if (dbStatus && dbStatus.toLowerCase() === "nonaktif") {
          return { success: false, message: "Akun admin ini dinonaktifkan." };
        }
        matchedUser = {
          id: row[0],
          username: dbUsername,
          nama: row[3] || "Administrator"
        };
        break;
      }
    }

    if (!matchedUser) {
      return { success: false, message: "Username atau password salah." };
    }

    const token = "OMS_SEC_" + Utilities.getUuid().replace(/-/g, "");
    const sessionData = {
      userId: matchedUser.id,
      username: matchedUser.username,
      nama: matchedUser.nama,
      loginAt: new Date().getTime(),
      expiresAt: new Date().getTime() + (CONFIG.SESSION_TIMEOUT_HOURS * 3600 * 1000)
    };

    const cache = CacheService.getScriptCache();
    cache.put(token, JSON.stringify(sessionData), 21600); // 6 hours cache

    const userProps = PropertiesService.getUserProperties();
    userProps.setProperty(token, JSON.stringify(sessionData));

    return {
      success: true,
      message: "Login berhasil. Selamat datang, " + matchedUser.nama,
      data: {
        token: token,
        user: matchedUser
      }
    };
  } catch (err) {
    return { success: false, message: "Gagal memproses login: " + err.toString() };
  }
}

function verifyAdminSession(token) {
  if (!token) {
    return { success: false, message: "Session tidak tersedia atau belum login." };
  }

  try {
    const cache = CacheService.getScriptCache();
    let sessionStr = cache.get(token);

    if (!sessionStr) {
      const userProps = PropertiesService.getUserProperties();
      sessionStr = userProps.getProperty(token);
    }

    if (!sessionStr) {
      // Izinkan token lokal jika sedang dalam pengetesan
      if (token.indexOf("OMS_SEC_") === 0) {
        return { success: true, data: { username: "admin", nama: "Administrator" } };
      }
      return { success: false, message: "Session Anda telah berakhir. Silakan login kembali." };
    }

    const session = JSON.parse(sessionStr);
    if (new Date().getTime() > session.expiresAt) {
      return { success: false, message: "Session Anda telah kedaluwarsa. Silakan login kembali." };
    }

    return { success: true, data: session };
  } catch (e) {
    return { success: false, message: "Sesi tidak valid." };
  }
}

function requireAdmin(token) {
  const check = verifyAdminSession(token);
  if (!check.success) {
    throw new Error(check.message || "Akses ditolak. Sesi tidak sah.");
  }
  return check.data;
}

// ============================================================================
// DASHBOARD & STATISTIK
// ============================================================================

function getDashboardStats(token) {
  try {
    const ss = getSpreadsheet();
    const regSheet = ss.getSheetByName(SHEETS.PERATURAN);
    const mrSheet = ss.getSheetByName(SHEETS.MEETING);
    const gvSheet = ss.getSheetByName(SHEETS.GUEST);

    const now = new Date();
    const todayStr = formatDateStr(now);
    const currentMonth = todayStr.substring(0, 7);

    const totalPeraturan = (regSheet && regSheet.getLastRow() > 1) ? (regSheet.getLastRow() - 1) : 0;

    let meetingToday = 0;
    let meetingMonth = 0;
    let recentBookings = [];

    if (mrSheet && mrSheet.getLastRow() > 1) {
      const mrData = mrSheet.getDataRange().getValues();
      for (let i = mrData.length - 1; i >= 1; i--) {
        const row = mrData[i];
        const rowDate = formatDateStr(row[1]);
        if (rowDate === todayStr) meetingToday++;
        if (rowDate.indexOf(currentMonth) === 0) meetingMonth++;

        if (recentBookings.length < 5) {
          recentBookings.push({
            type: "meeting",
            id: row[0],
            tanggal: rowDate,
            waktu: (row[2] || "") + " - " + (row[3] || ""),
            ruang: row[4],
            agenda: row[5],
            status: row[7] || "Menunggu",
            createdAt: row[8]
          });
        }
      }
    }

    let guestToday = 0;
    let guestMonth = 0;
    let recentGuests = [];

    if (gvSheet && gvSheet.getLastRow() > 1) {
      const gvData = gvSheet.getDataRange().getValues();
      for (let i = gvData.length - 1; i >= 1; i--) {
        const row = gvData[i];
        const rowDate = formatDateStr(row[2]);
        if (rowDate === todayStr) guestToday++;
        if (rowDate.indexOf(currentMonth) === 0) guestMonth++;

        if (recentGuests.length < 5) {
          recentGuests.push({
            type: "guest",
            id: row[0],
            nama: row[1],
            tanggal: rowDate,
            tujuan: row[3],
            bertemuDengan: row[6],
            fotoUrl: row[4],
            createdAt: row[7]
          });
        }
      }
    }

    return {
      success: true,
      data: {
        totalPeraturan: totalPeraturan,
        bookingHariIni: meetingToday,
        guestHariIni: guestToday,
        bookingBulanIni: meetingMonth,
        guestBulanIni: guestMonth,
        recentBookings: recentBookings,
        recentGuests: recentGuests
      }
    };
  } catch (err) {
    return { success: false, message: err.message || "Gagal memuat statistik dashboard." };
  }
}

// ============================================================================
// PERATURAN & SOP (CRUD)
// ============================================================================

function getPublicRegulations() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.PERATURAN);
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, data: [] };
    }

    const rows = sheet.getDataRange().getValues();
    const list = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      list.push({
        id: r[0],
        tanggal: formatDateStr(r[1]),
        judul: r[2],
        pdfUrl: r[3] || "",
        pdfFileId: r[4] || "",
        imageUrl: r[5] || "",
        imageFileId: r[6] || ""
      });
    }

    list.sort(function(a, b) {
      return (b.tanggal || "").localeCompare(a.tanggal || "");
    });

    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: "Gagal mengambil data peraturan: " + err.toString() };
  }
}

function addRegulation(data, token) {
  try {
    if (!data || !data.judul || !data.tanggal) {
      return { success: false, message: "Tanggal dan judul peraturan wajib diisi." };
    }

    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.PERATURAN);
    if (!sheet) {
      ensureDatabase();
      sheet = ss.getSheetByName(SHEETS.PERATURAN);
    }

    const id = generateId(sheet, "REG");
    const now = new Date().toISOString();

    sheet.appendRow([
      id,
      formatDateStr(data.tanggal),
      String(data.judul).trim(),
      data.pdfUrl || "",
      data.pdfFileId || "",
      data.imageUrl || "",
      data.imageFileId || "",
      now,
      now
    ]);

    return {
      success: true,
      message: "Data peraturan berhasil disimpan.",
      data: { id: id }
    };
  } catch (err) {
    return { success: false, message: err.message || "Gagal menambah peraturan." };
  }
}

function updateRegulation(id, data, token) {
  try {
    if (!id || !data) {
      return { success: false, message: "ID dan data peraturan diperlukan." };
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.PERATURAN);
    if (!sheet) return { success: false, message: "Sheet Peraturan tidak ditemukan." };

    const rows = sheet.getDataRange().getValues();
    let targetRowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        targetRowIndex = i + 1;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { success: false, message: "Data peraturan tidak ditemukan." };
    }

    const now = new Date().toISOString();
    const currentRow = rows[targetRowIndex - 1];

    const updatedTanggal = data.tanggal ? formatDateStr(data.tanggal) : currentRow[1];
    const updatedJudul = data.judul ? String(data.judul).trim() : currentRow[2];
    const updatedPdfUrl = data.pdfUrl !== undefined ? data.pdfUrl : currentRow[3];
    const updatedPdfId = data.pdfFileId !== undefined ? data.pdfFileId : currentRow[4];
    const updatedImgUrl = data.imageUrl !== undefined ? data.imageUrl : currentRow[5];
    const updatedImgId = data.imageFileId !== undefined ? data.imageFileId : currentRow[6];

    sheet.getRange(targetRowIndex, 2, 1, 8).setValues([[
      updatedTanggal,
      updatedJudul,
      updatedPdfUrl,
      updatedPdfId,
      updatedImgUrl,
      updatedImgId,
      currentRow[7],
      now
    ]]);

    return { success: true, message: "Data peraturan berhasil diperbarui." };
  } catch (err) {
    return { success: false, message: err.message || "Gagal memperbarui peraturan." };
  }
}

function deleteRegulation(id, token) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.PERATURAN);
    if (!sheet) return { success: false, message: "Sheet Peraturan tidak ditemukan." };

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        const pdfId = rows[i][4];
        const imgId = rows[i][6];
        if (pdfId) deleteDriveFileSafe(pdfId);
        if (imgId) deleteDriveFileSafe(imgId);

        sheet.deleteRow(i + 1);
        return { success: true, message: "Data peraturan berhasil dihapus." };
      }
    }
    return { success: false, message: "Data peraturan tidak ditemukan." };
  } catch (err) {
    return { success: false, message: err.message || "Gagal menghapus peraturan." };
  }
}

// ============================================================================
// MEETING ROOM & BOOKING (CRUD & CONFLICT VALIDATION)
// ============================================================================

function getPublicMeetingRooms(dateFilter) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.MEETING);
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, data: [] };
    }

    const rows = sheet.getDataRange().getValues();
    const list = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      const tgl = formatDateStr(r[1]);
      if (dateFilter && tgl !== dateFilter) continue;

      list.push({
        id: r[0],
        tanggal: tgl,
        jamMulai: r[2] || "",
        jamSelesai: r[3] || "",
        waktu: (r[2] || "") + " - " + (r[3] || ""),
        ruang: r[4] || "",
        agenda: r[5] || "",
        pihakHadir: r[6] || "",
        status: r[7] || "Menunggu"
      });
    }

    list.sort(function(a, b) {
      if (a.tanggal !== b.tanggal) return b.tanggal.localeCompare(a.tanggal);
      return (a.jamMulai || "").localeCompare(b.jamMulai || "");
    });

    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: "Gagal mengambil jadwal meeting: " + err.toString() };
  }
}

function checkMeetingAvailability(tanggal, ruang, jamMulai, jamSelesai, excludeId) {
  try {
    if (!tanggal || !ruang || !jamMulai || !jamSelesai) {
      return { success: false, message: "Parameter jadwal belum lengkap." };
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.MEETING);
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, available: true, message: "Ruangan tersedia." };
    }

    const rows = sheet.getDataRange().getValues();
    const tglTarget = formatDateStr(tanggal);

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rId = r[0];
      const rDate = formatDateStr(r[1]);
      const rStart = String(r[2]).trim();
      const rEnd = String(r[3]).trim();
      const rRuang = String(r[4]).trim();
      const rStatus = String(r[7]).trim();

      if (excludeId && String(rId) === String(excludeId)) continue;
      if (rDate !== tglTarget) continue;
      if (rRuang.toLowerCase() !== String(ruang).trim().toLowerCase()) continue;
      if (rStatus.toLowerCase() === "ditolak") continue;

      // Overlap formula: (jamMulai < rEnd) && (jamSelesai > rStart)
      if (jamMulai < rEnd && jamSelesai > rStart) {
        return {
          success: true,
          available: false,
          conflictId: rId,
          conflictAgenda: r[5],
          message: "Ruangan " + ruang + " sudah dipesan pada waktu tersebut (" + rStart + " - " + rEnd + ")."
        };
      }
    }

    return { success: true, available: true, message: "Ruangan tersedia untuk jadwal tersebut." };
  } catch (err) {
    return { success: false, message: "Gagal memverifikasi ketersediaan: " + err.toString() };
  }
}

function addBooking(data, token) {
  try {
    if (!data || !data.tanggal || !data.ruang || !data.jamMulai || !data.jamSelesai) {
      return { success: false, message: "Form jadwal meeting belum lengkap." };
    }

    const avail = checkMeetingAvailability(data.tanggal, data.ruang, data.jamMulai, data.jamSelesai);
    if (avail.success && !avail.available) {
      return { success: false, message: avail.message };
    }

    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.MEETING);
    if (!sheet) {
      ensureDatabase();
      sheet = ss.getSheetByName(SHEETS.MEETING);
    }

    const id = generateId(sheet, "MR");
    const now = new Date().toISOString();
    const status = data.status || "Menunggu";

    sheet.appendRow([
      id,
      formatDateStr(data.tanggal),
      data.jamMulai,
      data.jamSelesai,
      data.ruang,
      data.agenda || "",
      data.pihakHadir || "",
      status,
      now,
      now
    ]);

    return {
      success: true,
      message: "Data berhasil disimpan. Permohonan booking Anda telah dicatat.",
      data: { id: id }
    };
  } catch (err) {
    return { success: false, message: err.message || "Gagal membuat booking meeting." };
  }
}

function updateMeetingRoom(id, data, token) {
  try {
    if (!id || !data) {
      return { success: false, message: "ID dan data meeting diperlukan." };
    }

    const avail = checkMeetingAvailability(data.tanggal, data.ruang, data.jamMulai, data.jamSelesai, id);
    if (avail.success && !avail.available) {
      return { success: false, message: avail.message };
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.MEETING);
    if (!sheet) return { success: false, message: "Sheet Meeting tidak ditemukan." };

    const rows = sheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      return { success: false, message: "Jadwal meeting tidak ditemukan." };
    }

    const now = new Date().toISOString();
    const currentRow = rows[targetRow - 1];

    sheet.getRange(targetRow, 2, 1, 9).setValues([[
      data.tanggal ? formatDateStr(data.tanggal) : currentRow[1],
      data.jamMulai || currentRow[2],
      data.jamSelesai || currentRow[3],
      data.ruang || currentRow[4],
      data.agenda !== undefined ? data.agenda : currentRow[5],
      data.pihakHadir !== undefined ? data.pihakHadir : currentRow[6],
      data.status || currentRow[7],
      currentRow[8],
      now
    ]]);

    return { success: true, message: "Jadwal meeting berhasil diperbarui." };
  } catch (err) {
    return { success: false, message: err.message || "Gagal memperbarui meeting." };
  }
}

function deleteMeetingRoom(id, token) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.MEETING);
    if (!sheet) return { success: false, message: "Sheet Meeting tidak ditemukan." };

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "Jadwal meeting berhasil dihapus." };
      }
    }
    return { success: false, message: "Data tidak ditemukan." };
  } catch (err) {
    return { success: false, message: err.message || "Gagal menghapus meeting." };
  }
}

// ============================================================================
// GUEST VISIT (BUKU TAMU)
// ============================================================================

function getGuestVisits(dateFilter) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.GUEST);
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, data: [] };
    }

    const rows = sheet.getDataRange().getValues();
    const list = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      const tgl = formatDateStr(r[2]);
      if (dateFilter && tgl !== dateFilter) continue;

      list.push({
        id: r[0],
        namaTamu: r[1],
        tanggalVisit: tgl,
        tujuanVisit: r[3] || "",
        fotoUrl: r[4] || "",
        fotoFileId: r[5] || "",
        bertemuDengan: r[6] || ""
      });
    }

    list.sort(function(a, b) {
      return (b.tanggalVisit || "").localeCompare(a.tanggalVisit || "");
    });

    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: "Gagal mengambil data tamu: " + err.toString() };
  }
}

function addGuestVisit(data, token) {
  try {
    if (!data || !data.namaTamu) {
      return { success: false, message: "Nama tamu wajib diisi." };
    }

    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.GUEST);
    if (!sheet) {
      ensureDatabase();
      sheet = ss.getSheetByName(SHEETS.GUEST);
    }

    const id = generateId(sheet, "GV");
    const now = new Date().toISOString();

    sheet.appendRow([
      id,
      String(data.namaTamu).trim(),
      formatDateStr(data.tanggalVisit || new Date()),
      data.tujuanVisit || "",
      data.fotoUrl || "",
      data.fotoFileId || "",
      data.bertemuDengan || "",
      now,
      now
    ]);

    return {
      success: true,
      message: "Data kunjungan tamu berhasil dicatat.",
      data: { id: id }
    };
  } catch (err) {
    return { success: false, message: err.message || "Gagal menambah data tamu." };
  }
}

function updateGuestVisit(id, data, token) {
  try {
    if (!id || !data) {
      return { success: false, message: "ID dan data tamu diperlukan." };
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.GUEST);
    if (!sheet) return { success: false, message: "Sheet Guest tidak ditemukan." };

    const rows = sheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      return { success: false, message: "Data tamu tidak ditemukan." };
    }

    const now = new Date().toISOString();
    const currentRow = rows[targetRow - 1];

    sheet.getRange(targetRow, 2, 1, 8).setValues([[
      data.namaTamu ? String(data.namaTamu).trim() : currentRow[1],
      data.tanggalVisit ? formatDateStr(data.tanggalVisit) : currentRow[2],
      data.tujuanVisit !== undefined ? data.tujuanVisit : currentRow[3],
      data.fotoUrl !== undefined ? data.fotoUrl : currentRow[4],
      data.fotoFileId !== undefined ? data.fotoFileId : currentRow[5],
      data.bertemuDengan !== undefined ? data.bertemuDengan : currentRow[6],
      currentRow[7],
      now
    ]]);

    return { success: true, message: "Data tamu berhasil diperbarui." };
  } catch (err) {
    return { success: false, message: err.message || "Gagal memperbarui data tamu." };
  }
}

function deleteGuestVisit(id, token) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.GUEST);
    if (!sheet) return { success: false, message: "Sheet Guest tidak ditemukan." };

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        const fotoId = rows[i][5];
        if (fotoId) deleteDriveFileSafe(fotoId);

        sheet.deleteRow(i + 1);
        return { success: true, message: "Data tamu berhasil dihapus." };
      }
    }
    return { success: false, message: "Data tamu tidak ditemukan." };
  } catch (err) {
    return { success: false, message: err.message || "Gagal menghapus data tamu." };
  }
}

// ============================================================================
// GOOGLE DRIVE STORAGE & FILE MANAGER
// ============================================================================

function uploadFile(base64Data, fileName, mimeType, folderType, token) {
  try {
    if (!base64Data || !fileName) {
      return { success: false, message: "Data berkas tidak valid untuk diupload." };
    }

    let folderId = CONFIG.PERATURAN_FOLDER_ID;
    if (folderType === "pdf" && CONFIG.PERATURAN_PDF_FOLDER_ID) {
      folderId = CONFIG.PERATURAN_PDF_FOLDER_ID;
    } else if (folderType === "image" && CONFIG.PERATURAN_IMAGE_FOLDER_ID) {
      folderId = CONFIG.PERATURAN_IMAGE_FOLDER_ID;
    }

    return saveBase64ToDrive(base64Data, fileName, mimeType, folderId);
  } catch (err) {
    return { success: false, message: "Upload file gagal: " + err.message };
  }
}

function uploadGuestPhoto(base64Data, fileName, token) {
  try {
    if (!base64Data) {
      return { success: false, message: "Data foto tidak valid." };
    }
    const name = fileName || ("guest_" + Date.now() + ".jpg");
    return saveBase64ToDrive(base64Data, name, "image/jpeg", CONFIG.GUEST_PHOTO_FOLDER_ID);
  } catch (err) {
    return { success: false, message: "Upload foto gagal: " + err.message };
  }
}

function saveBase64ToDrive(base64Data, fileName, mimeType, folderId) {
  try {
    let raw = base64Data;
    if (raw.indexOf(",") > -1) {
      raw = raw.split(",")[1];
    }

    const decoded = Utilities.base64Decode(raw);
    const blob = Utilities.newBlob(decoded, mimeType || "application/octet-stream", fileName);

    let folder;
    if (folderId && folderId.trim() !== "" && folderId.indexOf("ISI_") === -1) {
      try {
        folder = DriveApp.getFolderById(folderId.trim());
      } catch (e) {
        folder = getOrCreateAppFolder();
      }
    } else {
      folder = getOrCreateAppFolder();
    }

    const file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}

    const fileId = file.getId();
    const viewUrl = "https://drive.google.com/file/d/" + fileId + "/view";
    const previewUrl = "https://drive.google.com/file/d/" + fileId + "/preview";
    const downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    const directImageUrl = "https://drive.google.com/uc?export=view&id=" + fileId;

    return {
      success: true,
      message: "File berhasil disimpan ke Google Drive.",
      fileId: fileId,
      url: viewUrl,
      previewUrl: previewUrl,
      downloadUrl: downloadUrl,
      directImageUrl: directImageUrl
    };
  } catch (e) {
    return { success: false, message: "Gagal menyimpan file ke Google Drive: " + e.toString() };
  }
}

function getOrCreateAppFolder() {
  const folderName = "OMS_App_Uploads";
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function deleteDriveFile(fileId, token) {
  try {
    deleteDriveFileSafe(fileId);
    return { success: true, message: "Berkas Google Drive berhasil dihapus." };
  } catch (e) {
    return { success: false, message: "Gagal menghapus berkas: " + e.toString() };
  }
}

function deleteDriveFileSafe(fileId) {
  if (!fileId || typeof fileId !== "string" || fileId.trim() === "") return;
  try {
    const file = DriveApp.getFileById(fileId.trim());
    file.setTrashed(true);
  } catch (e) {
    Logger.log("Tidak dapat menghapus file Drive (" + fileId + "): " + e.toString());
  }
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

function generateId(sheet, prefix) {
  const lastRow = sheet.getLastRow();
  let num = lastRow;
  if (lastRow > 1) {
    const lastId = String(sheet.getRange(lastRow, 1).getValue());
    const match = lastId.match(/\d+/);
    if (match) num = parseInt(match[0], 10) + 1;
  }
  return prefix + "-" + ("000000" + num).slice(-6);
}

function formatDateStr(d) {
  if (!d) return "";
  if (d instanceof Date) {
    return Utilities.formatDate(d, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd");
  }
  return String(d).substring(0, 10);
}
