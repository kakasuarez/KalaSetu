import React, { useState } from 'react';
import { View, Button, ActivityIndicator, Alert } from 'react-native';
import { mediaApi } from '../api/media';
import { listingsApi } from '../api/listings';
import { ModelViewer3D } from '../components/ModelViewer3D';

export const ReviewListingScreen = ({ route }: any) => {
  const { primaryMediaId, mediaIds = [] } = route.params;
  const [glbMediaId, setGlbMediaId] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const generate3DModel = async (hfToken?: string) => {
    try {
      setLoading(true);
      const result = await mediaApi.generate3d(primaryMediaId, hfToken);
      setGlbMediaId(result.id);
      setGlbUrl(result.location);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate 3D model.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateListing = async (listingDetails: any) => {
    const updatedMediaIds = glbMediaId ? [...mediaIds, glbMediaId] : mediaIds;
    
    await listingsApi.create({
      ...listingDetails,
      primary_media_id: primaryMediaId,
      media_ids: updatedMediaIds,
    });
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : glbUrl ? (
        <ModelViewer3D url={glbUrl} />
      ) : (
        <Button title="Create 3D" onPress={() => generate3DModel()} />
      )}
    </View>
  );
};