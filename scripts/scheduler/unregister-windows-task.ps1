# MarketRadar — elimina la tarea programada del sync automático.
$TaskName = "MarketRadar market data sync"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Removed '$TaskName'."
} else {
  Write-Output "'$TaskName' is not registered."
}
