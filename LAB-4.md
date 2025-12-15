## Lab 4 - Deploy Virtual Machine


1. Run Login.

2. Run "gdcloud compute images list" to list available images.

3. Run "gdcloud compute machine-types list" to list available machine types.

4. Run ./create-vm.sh [VM_Name] [Machine_Type] [Image_Type]

example: ./create-vm.sh test-vm n3-standard-2-gdc rocky-8-v20250210-gdch

#Pick the image and the machine types from the available list.

5. SSH into vm from GDC Console