# SunLuna2000_iobroker
 Javascript support for Huawei Sun & Luna 2000 in iobroker.

## Introduction
The development of this script started in the iobroker Forum "Huawei Sun2000 & ioBroker via JS script funktioniert", see https://forum.iobroker.net/topic/53005/huawei-sun2000-iobroker-via-js-script-funktioniert

The script was started by Kachel; modified, corrected, extended and finally published on Github by Chris_B.

## Computations
The computations implemented are described by this diagram (that I found somewhere on the web):

![Screenshot](HuaweiSunLuna2000.png)

Remarks:
- Sometimes variables computed seem to be a bit 'off'. This is most probably caused by the fact that the values below are not sampled at precisely the same time. When values change rapidly this can lead to these 'strange' values.

## Example Vis
The following picture shows an example Vis that shows the energy flow between the different components. In the lower part a flot diagram shows battery charge, power production and consumption during the last 48 hours

![Screenshot](SunLuna2000Vis.png)

The following variables are used in the Vis display:

- Yield Today: javascript.0.Solarpower.Derived.YieldToday
- Bat Charge: javascript.0.Solarpower.Huawei.Inverter.1.Batterystack.1.CurrentDayChargeCapacity
- Bat Discharge: javascript.0.Solarpower.Huawei.Inverter.1.Batterystack.1.CurrentDayDischargeCapacity
- Batterie Percent: javascript.0.Solarpower.Huawei.Inverter.1.Battery.SOC, darunter javascript.0.Solarpower.Derived.BatteryOverview
- Solar panel, actual power: javascript.0.Solarpower.Huawei.Inverter.1.InputPower
- Solar panel voltage and current: javascript.0.Solarpower.Huawei.Inverter.1.String.1_Voltage, javascript.0.Solarpower.Huawei.Inverter.1.String.1_Current
- Power to and from battery: javascript.0.Solarpower.Huawei.Inverter.1.Batterystack.1.ChargeAndDischargePower
- Direction of arrow at battery: javascript.0.Solarpower.Derived.IsBatteryLoading (arrow is directed left or right)
- Power to and from grid: javascript.0.Solarpower.Huawei.Meter.ActivePower
- Direction of grid arrow: javascript.0.Solarpower.Derived.IsGridExporting
- Power consumption house: javascript.0.Solarpower.Derived.HouseConsumption
- Daily power consumption of house: javascript.0.Solarpower.Derived.ConsumptionToday
- Power Export Today: javascript.0.Solarpower.Derived.GridExportToday
- Import Today: javascript.0.Solarpower.Derived.GridImportToday

The battery symbol is a png with a bar graph in the back.