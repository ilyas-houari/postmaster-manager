@echo off
cd /d "C:\Users\Admin1\Desktop\Python\PostMaster\postmaster-manager"

echo ===== DAILY SYNC START %date% %time% ===== >> sync\daily_sync.log

"C:\Users\Admin1\Desktop\Python\PostMaster\.venv\Scripts\python.exe" -u sync\sync_stats.py --limit 258 --days 2 >> sync\daily_sync.log 2>&1

if errorlevel 1 (
    echo SYNC FAILED - CLEANUP SKIPPED >> sync\daily_sync.log
    exit /b 1
)

"C:\Users\Admin1\Desktop\Python\PostMaster\.venv\Scripts\python.exe" -u sync\cleanup_stats.py --apply >> sync\daily_sync.log 2>&1

if errorlevel 1 (
    echo CLEANUP FAILED >> sync\daily_sync.log
    exit /b 1
)

echo ===== DAILY SYNC + CLEANUP SUCCESS %date% %time% ===== >> sync\daily_sync.log
exit /b 0
