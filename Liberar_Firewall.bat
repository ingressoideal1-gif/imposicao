@echo off
echo =======================================================
echo Removendo a regra de firewall da porta 9000 (modo Admin)
echo =======================================================
echo.
echo O NewProd Agent passou a escutar apenas em 127.0.0.1
echo (cada operador imprime na propria maquina), entao a
echo porta 9000 nao precisa mais ficar aberta na rede.
echo.
netsh advfirewall firewall delete rule name="NewProd Agent" protocol=TCP localport=9000
echo.
echo Regra removida. O agente continua funcionando normalmente
echo pelo navegador em http://127.0.0.1:9000
pause
