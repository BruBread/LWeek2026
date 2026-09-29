// Copy this file to secrets.h (git ignores it) and put your real Wi-Fi names and passwords in it.
// Networks in order of preference. Each ip must be free on that network and sit in its router's subnet.
Net NETS[] = {
  { "BoothRouter", "booth-password",  IPAddress(192, 168, 0, 50), IPAddress(192, 168, 0, 1) },
  { "BackupWifi",  "backup-password", IPAddress(192, 168, 1, 50), IPAddress(192, 168, 1, 1) },
};
