@echo off
echo =======================================================
echo Liberando porta 9000 no Windows Firewall (modo Admin)...
echo =======================================================
netsh advfirewall firewall add rule name="NewProd Agent" dir=in action=allow protocol=TCP localport=9000 profile=any enable=yes
echo Porta 9000 liberada com sucesso!
pause
