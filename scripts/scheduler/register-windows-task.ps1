# MarketRadar — registra el sync automático en el Programador de tareas de Windows (coste 0 €).
#
# La tarea se lanza CADA HORA; es `npm run sync -- auto` quien decide si hay algo que hacer según el
# calendario oficial de mercado (sesión definitiva = cierre + 4 h 20 min, medias sesiones incluidas).
# Fines de semana, festivos y horas sin sesión nueva: termina en segundos sin llamar a ningún proveedor.
# Si el PC estaba apagado, la tarea se ejecuta al volver a encenderlo (StartWhenAvailable).
#
# Uso (PowerShell, en la carpeta del proyecto):
#   powershell -ExecutionPolicy Bypass -File scripts/scheduler/register-windows-task.ps1
# Eliminar:
#   powershell -ExecutionPolicy Bypass -File scripts/scheduler/unregister-windows-task.ps1
#
# Requisitos: Docker Desktop + Supabase local arrancados (npm run db:start). Si no lo están, la
# ejecución falla, queda registrada en data/logs/sync-auto.log y se reintenta a la hora siguiente.

$ErrorActionPreference = "Stop"
$TaskName = "MarketRadar market data sync"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$Log = Join-Path $ProjectDir "data\logs\scheduler.log"

# cmd /c para redirigir la salida a un log (la tarea no tiene consola).
$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$Npm`" run sync -- auto >> `"$Log`" 2>&1`"" -WorkingDirectory $ProjectDir
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)

New-Item -ItemType Directory -Force (Split-Path $Log) | Out-Null
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "MarketRadar: calendar-aware hourly market data sync (npm run sync -- auto). Free data sources only." -Force | Out-Null
Write-Output "Registered '$TaskName' (hourly, calendar-aware). Log: $Log"
